// useAsyncMutation: hook utilitario que wrappa uma mutation assincrona
// e dispara toast.error em caso de falha (Sprint 26).
//
// API:
//   const { run, isRunning } = useAsyncMutation()
//   await run(async () => saveProcess(payload), {
//     successMessage: 'Processo salvo',
//     errorMessage: 'Falha ao salvar processo',
//   })
//
// IMPORTANTE: SEMPRE faca `await` dentro de um try/catch. O rethrow
// e necessario para que o caller possa tratar o erro (ex: limpar
// estado), mas dispara unhandledRejection no Node se ignorado.
// Por padrao NAO dispara toast.success (a pagina que decide se quer
// feedback positivo via setState local). Mas se successMessage for
// fornecido, dispara.

import { useCallback, useState } from 'react'
import { useToast } from '../components/Toast'

function describeError(error) {
  if (!error) return 'Erro desconhecido'
  if (typeof error === 'string') return error
  return error?.message ?? error?.code ?? 'Erro desconhecido'
}

export function useAsyncMutation() {
  const toast = useToast()
  const [isRunning, setIsRunning] = useState(false)

  const run = useCallback(
    async (fn, options = {}) => {
      const {
        successMessage,
        errorMessage,
        onSuccess,
        onError,
      } = options

      setIsRunning(true)
      try {
        const result = await fn()
        if (successMessage) toast.success(successMessage)
        onSuccess?.(result)
        return result
      } catch (error) {
        console.error('useAsyncMutation falhou.', error)
        const base = errorMessage ?? 'Operacao falhou'
        const detail = describeError(error)
        toast.error(detail && detail !== 'Erro desconhecido' ? `${base} (${detail})` : base)
        onError?.(error)
        // Cria uma promise rejected controlada, anexa um .catch
        // vazio pra marcar como "handled" (evita unhandledRejection
        // em ambientes como o CI do GitHub Actions), e re-throw via
        // `await` no proximo microtask. Quem usa try/catch no await
        // continua recebendo o erro normalmente.
        const handled = Promise.reject(error)
        handled.catch(() => {})
        return handled
      } finally {
        setIsRunning(false)
      }
    },
    [toast]
  )

  return { run, isRunning }
}

export default useAsyncMutation
