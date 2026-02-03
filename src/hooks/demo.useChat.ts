import { useEffect, useRef } from 'react'
import { useLiveQuery } from '@tanstack/react-db'

import type { Collection } from '@tanstack/react-db'
import type {Message} from '@/db-collections';
import {  messagesCollection } from '@/db-collections'


function useStreamConnection(
  url: string,
  collection: Collection<any, any, any>,
) {
  const loadedRef = useRef(false)

  useEffect(() => {
    const fetchData = async () => {
      if (loadedRef.current) return
      loadedRef.current = true

      const response = await fetch(url)
      const reader = response.body?.getReader()
      if (!reader) {
        return
      }

      const decoder = new TextDecoder()
      let done = false
      while (!done) {
        const result = await reader.read()
        done = result.done
        if (result.value) {
          for (const line of decoder
            .decode(result.value, { stream: true })
            .split('\n')
            .filter((c) => c.length > 0)) {
            collection.insert(JSON.parse(line))
          }
        }
      }
    }
    fetchData()
  }, [])
}

export function useChat() {
  useStreamConnection('/demo/db-chat-api', messagesCollection)

  const sendMessage = (message: string, user: string) => {
    fetch('/demo/db-chat-api', {
      method: 'POST',
      body: JSON.stringify({ text: message.trim(), user: user.trim() }),
    })
  }

  return { sendMessage }
}

export function useMessages() {
  const { data: messages } = useLiveQuery((q) =>
    q.from({ message: messagesCollection }).select(({ message }) => ({
      ...message,
    })),
  )

  return messages as Array<Message>
}
