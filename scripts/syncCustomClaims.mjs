// Backfill de custom claims (role, status) para todos os usuários do
// Portal COMEX, lendo o estado atual de Firestore `users/{uid}`.
//
// Por que: S3 do Roadmap — "Migrar role para custom claims".
//   - Antes: as `firestore.rules` leem `users/{uid}.role` via `firestore.get`
//     (latência por request, risco de "preso" se o doc não existir).
//   - Depois: claims via `request.auth.token.role` (self-contained).
//
// Uso:
//   set GOOGLE_APPLICATION_CREDENTIALS=...\service-account.json
//   node scripts/syncCustomClaims.mjs
//   node scripts/syncCustomClaims.mjs --dry-run    # apenas lista
//   node scripts/syncCustomClaims.mjs --uid=ABC123  # um usuário
//
// O script é idempotente: pula usuários cujas claims já batem com o Firestore.

import { readFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const ALLOWED_ROLES = new Set(['user', 'admin', 'logistica', 'compras', 'viewer']);
const ALLOWED_STATUSES = new Set(['Pendente', 'Ativo', 'Bloqueado', 'Reprovado']);

function loadServiceAccount() {
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!path) {
    throw new Error(
      'Defina GOOGLE_APPLICATION_CREDENTIALS apontando para o JSON da service account com permissão admin auth.'
    );
  }
  const raw = readFileSync(path, 'utf-8');
  return JSON.parse(raw);
}

function normalize(value, fallback) {
  const s = String(value ?? '').trim();
  return s.length > 0 ? s : fallback;
}

function normalizeClaims(rawProfile, fallbackRole, fallbackStatus) {
  const role = ALLOWED_ROLES.has(rawProfile?.role) ? rawProfile.role : fallbackRole;
  const status = ALLOWED_STATUSES.has(rawProfile?.status) ? rawProfile.status : fallbackStatus;
  return { role, status };
}

function claimsMatch(existing, next) {
  if (!existing) return false;
  return existing.role === next.role && existing.status === next.status;
}

async function listTargetUids(db, onlyUid) {
  if (onlyUid) {
    return [onlyUid];
  }
  const snapshot = await db.collection('users').get();
  return snapshot.docs.map((doc) => doc.id);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const onlyUid = (() => {
    const arg = process.argv.find((a) => a.startsWith('--uid='));
    return arg ? arg.slice('--uid='.length) : null;
  })();

  const serviceAccount = loadServiceAccount();
  initializeApp({ credential: cert(serviceAccount) });
  const auth = getAuth();
  const db = getFirestore();

  const uids = await listTargetUids(db, onlyUid);
  console.log(`[syncCustomClaims] ${uids.length} usuario(s) alvo. dryRun=${dryRun}`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const failures = [];

  for (const uid of uids) {
    try {
      const profileSnap = await db.collection('users').doc(uid).get();
      const profile = profileSnap.exists ? profileSnap.data() : null;
      const claims = normalizeClaims(profile, 'user', 'Pendente');

      const existing = await auth.getUser(uid).catch(() => null);
      if (!existing) {
        // Sem auth user, não há claims para escrever. Pula.
        skipped += 1;
        continue;
      }

      const current = existing.customClaims ?? {};
      if (claimsMatch(current, claims)) {
        skipped += 1;
        continue;
      }

      if (!dryRun) {
        await auth.setCustomUserClaims(uid, claims);
      }
      updated += 1;
      console.log(
        `[syncCustomClaims] ${dryRun ? '(dry) ' : ''}${uid} -> role=${claims.role}, status=${claims.status}`
      );
    } catch (error) {
      failed += 1;
      failures.push({ uid, error: error?.message ?? String(error) });
      console.error(`[syncCustomClaims] ${uid} falhou: ${error?.message ?? error}`);
    }
  }

  console.log(
    `[syncCustomClaims] done. updated=${updated} skipped=${skipped} failed=${failed} dryRun=${dryRun}`
  );
  if (failures.length > 0) {
    console.error('[syncCustomClaims] falhas:', failures);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[syncCustomClaims] erro fatal:', error);
  process.exit(1);
});
