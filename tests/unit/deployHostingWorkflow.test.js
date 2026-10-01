// Guarda do workflow de deploy do Hosting (L20). Le .github/workflows/*.yml como
// YAML e garante: (a) o dist/ publicado sobe como artifact SO depois de um deploy
// bem-sucedido (prova de publicacao: sem credencial ou com deploy falho, nao ha artifact);
// (b) o nome do artifact usa o commit publicado (steps.commit), nao github.sha;
// (c) gate por CI e autenticacao (WIF) seguem intactos; (d) o ci.yml nao duplica
// o artifact do dist (so o playwright-report).
// js-yaml vem por dependencia de firebase-tools/eslint (nao esta no package.json).
import fs from 'node:fs'
import path from 'node:path'
import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

function readWorkflow(name) {
  return load(fs.readFileSync(path.resolve(ROOT, '.github/workflows', name), 'utf8'))
}

const deploy = readWorkflow('deploy-hosting.yml')
const job = deploy.jobs['build-and-deploy']
const steps = job.steps

const isUpload = (step) => String(step.uses ?? '').startsWith('actions/upload-artifact')
const findIndex = (predicate, label) => {
  const index = steps.findIndex(predicate)
  expect(index, `step ausente: ${label}`).toBeGreaterThanOrEqual(0)
  return index
}

describe('deploy-hosting.yml - artifact do dist/ publicado (L20)', () => {
  it('sobe dist/ como artifact so depois do Build, da credencial e do deploy', () => {
    const build = findIndex((step) => step.run === 'npm run build', 'Build')
    const creds = findIndex((step) => step.name === 'Detectar credencial disponivel', 'credencial')
    const hostingDeploy = findIndex((step) => step.name === 'Deploy to Firebase Hosting', 'deploy')
    const uploads = steps.filter(isUpload)

    expect(uploads).toHaveLength(1)
    expect(uploads[0].uses).toBe('actions/upload-artifact@v4')

    const upload = steps.indexOf(uploads[0])
    expect(build).toBeLessThan(creds)
    expect(creds).toBeLessThan(hostingDeploy)
    expect(hostingDeploy).toBeLessThan(upload)
  })

  it('o artifact so existe quando o deploy rodou e terminou com sucesso', () => {
    const hostingDeploy = steps.find((step) => step.name === 'Deploy to Firebase Hosting')
    expect(hostingDeploy.id).toBe('deploy')
    expect(String(hostingDeploy.if)).toContain("steps.creds.outputs.auth_method != 'NONE'")

    const condition = String(steps.find(isUpload).if ?? '')
    // Sem credencial o deploy e pulado (outcome 'skipped'); com falha o job falha e
    // success() fica falso. Nos dois casos o upload nao roda.
    expect(condition).toContain('success()')
    expect(condition).toContain("steps.deploy.outcome == 'success'")
    expect(condition).toContain("steps.creds.outputs.auth_method != 'NONE'")
    expect(condition).not.toMatch(/\balways\(\)|\bfailure\(\)|!\s*cancelled\(\)/)
  })

  it('o nome do artifact identifica o commit publicado (nao github.sha)', () => {
    const upload = steps.find(isUpload)
    expect(upload.with.name).toBe('portal-comex-dist-${{ steps.commit.outputs.sha }}')
    expect(upload.with.name).not.toContain('github.sha')

    const commitIndex = findIndex((step) => step.id === 'commit', 'id: commit')
    expect(commitIndex).toBeLessThan(steps.indexOf(upload))
    const commitRun = steps[commitIndex].run
    expect(commitRun).toContain('git rev-parse HEAD')
    expect(commitRun).toContain('GITHUB_OUTPUT')
    expect(commitRun).toContain('sha=')
  })

  it('configura o upload: dist/, 10 dias, erro se vazio, sem ocultos, sem bloquear o deploy', () => {
    const upload = steps.find(isUpload)
    expect(upload.with.path).toBe('dist/')
    expect(upload.with['retention-days']).toBe(10)
    expect(upload.with['if-no-files-found']).toBe('error')
    expect(upload.with.overwrite).toBe(true)
    expect(upload.with['include-hidden-files']).toBeUndefined()
    expect(upload['continue-on-error']).toBe(true)
  })

  it('falha no upload do artifact (servico auxiliar) nao derruba um deploy ja publicado', () => {
    // O deploy roda antes do upload, entao a publicacao nunca depende do artifact.
    // continue-on-error garante que uma falha do upload vire anotacao e nao marque o
    // job (e o deploy que ja foi ao ar) como falho.
    const upload = steps.find(isUpload)
    const hostingDeploy = steps.findIndex((step) => step.name === 'Deploy to Firebase Hosting')
    expect(hostingDeploy).toBeLessThan(steps.indexOf(upload))
    expect(upload['continue-on-error']).toBe(true)

    const stepsBeforeDeploy = steps.slice(0, hostingDeploy + 1)
    expect(stepsBeforeDeploy.some(isUpload)).toBe(false)
  })

  it('gate por CI e autenticacao do deploy seguem inalterados', () => {
    expect(deploy.on.workflow_run).toEqual({
      workflows: ['CI'],
      types: ['completed'],
      branches: ['main'],
    })
    expect('workflow_dispatch' in deploy.on).toBe(true)
    expect(deploy.permissions).toEqual({ contents: 'read', 'id-token': 'write' })

    const gate = String(job.if)
    expect(gate).toContain("github.event.workflow_run.conclusion == 'success'")
    expect(gate).toContain("github.event.workflow_run.event == 'push'")
    expect(gate).toContain('github.event.workflow_run.head_repository.full_name == github.repository')
    expect(gate).toContain("github.ref == 'refs/heads/main'")

    const checkout = steps.find((step) => String(step.uses ?? '').startsWith('actions/checkout'))
    expect(checkout.with.ref).toContain('github.event.workflow_run.head_sha')

    const wif = steps.find((step) => step.uses === 'google-github-actions/auth@v2')
    expect(wif).toBeDefined()

    const hostingDeploy = steps.find((step) => step.name === 'Deploy to Firebase Hosting')
    expect(hostingDeploy.run).toContain('firebase deploy --only hosting')
    expect(hostingDeploy.run).toContain('--project sq-comex-updates-3d22f')
  })

  it('ci.yml nao duplica o artifact do dist (so playwright-report)', () => {
    const ci = readWorkflow('ci.yml')
    const names = Object.values(ci.jobs)
      .flatMap((ciJob) => ciJob.steps ?? [])
      .filter(isUpload)
      .map((step) => step.with.name)

    expect(names).toEqual(['playwright-report'])
  })
})
