import { useCallback, useEffect, useState } from 'react'
import { apiDelete, apiGet, apiPost, apiPut } from '../services/api'

/**
 * Hook para acessar o CRUD de fornecedores do IntelliQuote.
 * Encapsula loading + error + lista + operacoes de escrita.
 */
export function useSuppliers() {
  const [suppliers, setSuppliers] = useState([])
  const [contacts, setContacts] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await apiGet('/api/v1/suppliers')
      setSuppliers(list ?? [])
      const ids = (list ?? []).map((s) => s.id).join(',')
      if (ids) {
        const bulk = await apiGet(`/api/v1/supplier-contacts?supplierIds=${ids}`)
        setContacts(bulk?.bySupplier ?? {})
      } else {
        setContacts({})
      }
    } catch (err) {
      setError(err.message ?? String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const create = useCallback(async (payload) => {
    const created = await apiPost('/api/v1/suppliers', payload)
    await reload()
    return created
  }, [reload])

  const update = useCallback(async (id, payload) => {
    const updated = await apiPut(`/api/v1/suppliers/${id}`, payload)
    await reload()
    return updated
  }, [reload])

  const remove = useCallback(async (id) => {
    await apiDelete(`/api/v1/suppliers/${id}`)
    await reload()
  }, [reload])

  return { suppliers, contacts, loading, error, reload, create, update, remove }
}

export function useSupplierContacts(supplierId) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    if (!supplierId) {
      setList([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await apiGet(`/api/v1/suppliers/${supplierId}/contacts`)
      setList(data ?? [])
    } catch (err) {
      setError(err.message ?? String(err))
    } finally {
      setLoading(false)
    }
  }, [supplierId])

  useEffect(() => {
    void reload()
  }, [reload])

  const create = useCallback(async (payload) => {
    const created = await apiPost(`/api/v1/suppliers/${supplierId}/contacts`, payload)
    await reload()
    return created
  }, [supplierId, reload])

  const update = useCallback(async (contactId, payload) => {
    const updated = await apiPut(`/api/v1/suppliers/${supplierId}/contacts/${contactId}`, payload)
    await reload()
    return updated
  }, [supplierId, reload])

  const remove = useCallback(async (contactId) => {
    await apiDelete(`/api/v1/suppliers/${supplierId}/contacts/${contactId}`)
    await reload()
  }, [supplierId, reload])

  return { list, loading, error, reload, create, update, remove }
}