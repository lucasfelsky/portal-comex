import React, { createContext, useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'
import { useDoNotDisturb } from '../hooks/useDoNotDisturb'
import { useFcm } from '../hooks/useFcm'
import { OPEN_SUPPORT_MODAL_EVENT } from '../components/SupportButton'
import {
  NOTIFICATIONS_CHANGED_EVENT,
  listNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '../services/notificationsRepository'

export const NotificationsContext = createContext(null)

export function NotificationsProvider({ children }) {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [notificationFilter, setNotificationFilter] = useState('all')
  const [isPrefsModalOpen, setIsPrefsModalOpen] = useState(false)
  
  const dnd = useDoNotDisturb()
  const fcm = useFcm(profile?.uid)

  const unreadNotifications = useMemo(
    () => notifications.filter((item) => !item.isRead),
    [notifications]
  )

  const filteredNotifications = useMemo(() => {
    if (notificationFilter === 'all') return notifications
    return notifications.filter((item) => item.type === notificationFilter)
  }, [notificationFilter, notifications])

  const groupedNotifications = useMemo(() => {
    const groups = new Map()

    filteredNotifications.forEach((notification) => {
      const groupKey = `${notification.processId || notification.id}:${notification.type}`
      const currentGroup = groups.get(groupKey) ?? {
        processId: notification.processId,
        type: notification.type,
        title: notification.title,
        items: [],
        unreadCount: 0,
        latestCreatedAt: notification.createdAt,
      }

      currentGroup.items.push(notification)
      currentGroup.unreadCount += notification.isRead ? 0 : 1

      const currentGroupTime = new Date(currentGroup.latestCreatedAt ?? 0).getTime()
      const notificationTime = new Date(notification.createdAt ?? 0).getTime()

      if (notificationTime > currentGroupTime) {
        currentGroup.latestCreatedAt = notification.createdAt
        currentGroup.title = notification.title
      }

      groups.set(groupKey, currentGroup)
    })

    return [...groups.values()].sort((left, right) => {
      const leftTime = new Date(left.latestCreatedAt ?? 0).getTime()
      const rightTime = new Date(right.latestCreatedAt ?? 0).getTime()
      return rightTime - leftTime
    })
  }, [filteredNotifications])

  useEffect(() => {
    if (!profile?.uid) {
      setNotifications([])
      return undefined
    }

    let isMounted = true

    async function loadNotifications() {
      try {
        const loadedNotifications = await listNotifications(profile.uid)
        if (isMounted) {
          setNotifications(loadedNotifications)
        }
      } catch (error) {
        console.error('Falha ao carregar notificações.', error)
      }
    }

    function handleNotificationsChanged(event) {
      const affectedRecipients = event?.detail?.recipientUserIds ?? []
      if (affectedRecipients.length === 0 || affectedRecipients.includes(profile.uid)) {
        loadNotifications()
      }
    }

    function handleWindowFocus() {
      loadNotifications()
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        loadNotifications()
      }
    }

    loadNotifications()
    const intervalId = window.setInterval(loadNotifications, 10000)
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, handleNotificationsChanged)
    window.addEventListener('focus', handleWindowFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      isMounted = false
      window.clearInterval(intervalId)
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, handleNotificationsChanged)
      window.removeEventListener('focus', handleWindowFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [profile?.uid])

  useEffect(() => {
    if (!profile?.uid || !fcm.supported) return
    if (fcm.status === 'granted' || fcm.status === 'denied') return
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      fcm.enable()
    }
  }, [profile?.uid, fcm.supported, fcm.status])

  async function markOneNotificationAsRead(notification) {
    try {
      if (!notification.isRead) {
        await markNotificationAsRead(notification.id)
      }
    } catch (error) {
      console.error('Falha ao marcar notificação como lida.', error)
    } finally {
      setNotifications((currentNotifications) =>
        currentNotifications.map((item) =>
          item.id === notification.id
            ? { ...item, isRead: true, readAt: new Date().toISOString() }
            : item
        )
      )
    }
  }

  async function handleOpenNotification(notification, onClosePanel) {
    await markOneNotificationAsRead(notification)
    
    if (onClosePanel) {
      onClosePanel()
    }
    
    if (notification.type === 'support_ticket') {
      navigate('/admin/suporte')
      return
    }
    if (notification.type === 'support_ticket_resolved') {
      window.dispatchEvent(new Event(OPEN_SUPPORT_MODAL_EVENT))
      return
    }
    navigate('/processos', {
      state: {
        selectedProcessId: notification.processId,
        detailTab: notification.targetTab ?? 'messages',
      },
    })
  }

  async function handleMarkAllNotificationsAsRead() {
    if (!profile?.uid || unreadNotifications.length === 0) return

    try {
      await markAllNotificationsAsRead(profile.uid)
      setNotifications((currentNotifications) =>
        currentNotifications.map((item) => ({
          ...item,
          isRead: true,
          readAt: item.readAt ?? new Date().toISOString(),
        }))
      )
    } catch (error) {
      console.error('Falha ao marcar notificações como lidas.', error)
    }
  }

  function formatNotificationDate(value) {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  }

  function formatRelativeNotificationTime(value) {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    const diffInMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000))
    if (diffInMinutes < 1) return 'agora'
    if (diffInMinutes < 60) return `há ${diffInMinutes} min`
    const diffInHours = Math.round(diffInMinutes / 60)
    if (diffInHours < 24) return `há ${diffInHours} h`
    const diffInDays = Math.round(diffInHours / 24)
    return `há ${diffInDays} d`
  }

  const value = {
    notifications,
    unreadNotifications,
    groupedNotifications,
    notificationFilter,
    setNotificationFilter,
    markAllAsRead: handleMarkAllNotificationsAsRead,
    markOneAsRead: markOneNotificationAsRead,
    handleOpenNotification,
    formatRelativeNotificationTime,
    formatNotificationDate,
    dnd,
    fcm,
    isPrefsModalOpen,
    setIsPrefsModalOpen,
  }

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  )
}
