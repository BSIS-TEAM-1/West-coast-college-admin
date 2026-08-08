import { useLayoutEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

let studentWorkspaceOverlayDepth = 0
let studentWorkspaceBodyOverflow = ''
let studentWorkspaceHtmlOverflow = ''
let studentWorkspaceBodyPaddingRight = ''
let studentWorkspaceRootHadInert = false
let studentWorkspaceRootAriaHidden: string | null = null
let studentWorkspaceRootPointerEvents = ''
let studentWorkspaceRootUserSelect = ''

function useStudentWorkspaceOverlayLock() {
  useLayoutEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return undefined

    const { body, documentElement } = document
    const appRoot = document.getElementById('root')

    if (studentWorkspaceOverlayDepth === 0) {
      studentWorkspaceBodyOverflow = body.style.overflow
      studentWorkspaceHtmlOverflow = documentElement.style.overflow
      studentWorkspaceBodyPaddingRight = body.style.paddingRight

      const scrollbarWidth = Math.max(0, window.innerWidth - documentElement.clientWidth)
      body.style.overflow = 'hidden'
      documentElement.style.overflow = 'hidden'
      body.classList.add('student-workspace-overlay-open')
      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${scrollbarWidth}px`
      }

      if (appRoot) {
        studentWorkspaceRootHadInert = appRoot.hasAttribute('inert')
        studentWorkspaceRootAriaHidden = appRoot.getAttribute('aria-hidden')
        studentWorkspaceRootPointerEvents = appRoot.style.pointerEvents
        studentWorkspaceRootUserSelect = appRoot.style.userSelect
        appRoot.setAttribute('inert', '')
        appRoot.setAttribute('aria-hidden', 'true')
        appRoot.style.pointerEvents = 'none'
        appRoot.style.userSelect = 'none'
      }
    }

    studentWorkspaceOverlayDepth += 1

    return () => {
      studentWorkspaceOverlayDepth = Math.max(0, studentWorkspaceOverlayDepth - 1)
      if (studentWorkspaceOverlayDepth === 0) {
        body.style.overflow = studentWorkspaceBodyOverflow
        documentElement.style.overflow = studentWorkspaceHtmlOverflow
        body.style.paddingRight = studentWorkspaceBodyPaddingRight
        body.classList.remove('student-workspace-overlay-open')

        if (appRoot) {
          if (studentWorkspaceRootHadInert) {
            appRoot.setAttribute('inert', '')
          } else {
            appRoot.removeAttribute('inert')
          }

          if (studentWorkspaceRootAriaHidden === null) {
            appRoot.removeAttribute('aria-hidden')
          } else {
            appRoot.setAttribute('aria-hidden', studentWorkspaceRootAriaHidden)
          }

          appRoot.style.pointerEvents = studentWorkspaceRootPointerEvents
          appRoot.style.userSelect = studentWorkspaceRootUserSelect
        }
      }
    }
  }, [])
}

export function StudentWorkspaceOverlay({ children }: { children: ReactNode }) {
  useStudentWorkspaceOverlayLock()

  if (typeof document === 'undefined') return null
  return createPortal(children, document.body)
}

export function isStudentWorkspaceBackdropTarget(event: { target: EventTarget | null; currentTarget: EventTarget | null }) {
  return event.target === event.currentTarget
}
