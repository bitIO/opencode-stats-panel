import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { useApi } from "@/hooks/use-api"
import { api, type ProjectOption } from "@/lib/api"

const STORAGE_KEY = "osp.project.v1"

interface ProjectContextValue {
  projects: ProjectOption[]
  project: string | null
  setProject: (directory: string | null) => void
  attention: boolean
}

const ProjectContext = createContext<ProjectContextValue | null>(null)

function load(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v && v !== "all" ? v : null
  } catch {
    return null
  }
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { data } = useApi(api.projects, [])
  const [project, setProjectState] = useState<string | null>(() => load())
  const [attention, setAttention] = useState(false)

  useEffect(() => {
    if (project) {
      try {
        localStorage.setItem(STORAGE_KEY, project)
      } catch {
        /* storage unavailable — ignore */
      }
      setAttention(true)
    } else {
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch {
        /* ignore */
      }
      setAttention(false)
    }
  }, [project])

  useEffect(() => {
    if (!attention) return
    const t = setTimeout(() => setAttention(false), 2200)
    return () => clearTimeout(t)
  }, [attention])

  const setProject = useCallback((directory: string | null) => setProjectState(directory), [])

  return (
    <ProjectContext.Provider value={{ projects: data ?? [], project, setProject, attention }}>
      {children}
    </ProjectContext.Provider>
  )
}

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error("useProject must be used within ProjectProvider")
  return ctx
}