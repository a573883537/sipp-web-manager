import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SippStats, CsvStatsRow, ConnectionStatus, ScenarioFile, TestTask } from '@/types';

/**
 * 应用状态接口
 */
interface AppState {
  // 连接状态
  connectionStatus: ConnectionStatus;
  setConnectionStatus: (status: ConnectionStatus) => void;

  // SIPp统计数据
  stats: SippStats | null;
  setStats: (stats: SippStats) => void;

  // CSV统计数据
  csvStats: CsvStatsRow[];
  addCsvStats: (row: CsvStatsRow) => void;
  clearCsvStats: () => void;

  // 场景列表
  scenarios: ScenarioFile[];
  setScenarios: (scenarios: ScenarioFile[]) => void;

  // 当前场景
  currentScenario: string | null;
  setCurrentScenario: (scenario: string | null) => void;

  // 测试配置
  testConfig: {
    rate: number;
    users: number;
    limit: number;
  };
  setTestConfig: (config: Partial<AppState['testConfig']>) => void;

  // UI状态
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // 消息通知
  messages: Array<{ type: 'success' | 'error' | 'info'; content: string; timestamp: number }>;
  addMessage: (type: 'success' | 'error' | 'info', content: string) => void;
  clearMessages: () => void;

  // 测试任务历史
  tasks: TestTask[];
  currentTask: TestTask | null;
  addTask: (task: TestTask) => void;
  updateTask: (id: string, updates: Partial<TestTask>) => void;
  setCurrentTask: (task: TestTask | null) => void;
  setTasks: (tasks: TestTask[]) => void;
  clearTasks: () => void;
}

/**
 * 全局状态管理
 * 使用Zustand实现轻量级状态管理
 * 遵循单一职责原则
 */
export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // 连接状态
      connectionStatus: 'disconnected' as ConnectionStatus,
      setConnectionStatus: (status) => set({ connectionStatus: status }),

      // SIPp统计数据
      stats: null,
      setStats: (stats) => set({ stats }),

      // CSV统计数据
      csvStats: [],
      addCsvStats: (row) =>
        set((state) => ({
          csvStats: [...state.csvStats.slice(-1000), row], // 保留最近1000条
        })),
      clearCsvStats: () => set({ csvStats: [] }),

      // 场景列表
      scenarios: [],
      setScenarios: (scenarios) => set({ scenarios }),

      // 当前场景
      currentScenario: null,
      setCurrentScenario: (scenario) => set({ currentScenario: scenario }),

      // 测试配置（持久化）
      testConfig: {
        rate: 10,
        users: 100,
        limit: 0,
      },
      setTestConfig: (config) =>
        set((state) => ({
          testConfig: { ...state.testConfig, ...config },
        })),

      // UI状态
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      // 消息通知
      messages: [],
      addMessage: (type, content) =>
        set((state) => ({
          messages: [
            ...state.messages,
            {
              type,
              content,
              timestamp: Date.now(),
            },
          ],
        })),
      clearMessages: () => set({ messages: [] }),

      // 测试任务历史
      tasks: [],
      currentTask: null,
      addTask: (task) =>
        set((state) => ({
          tasks: [task, ...state.tasks].slice(0, 100), // 保留最近100个任务
          currentTask: task,
        })),
      updateTask: (id, updates) =>
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === id ? { ...task, ...updates } : task
          ),
          currentTask:
            state.currentTask?.id === id
              ? { ...state.currentTask, ...updates }
              : state.currentTask,
        })),
      setCurrentTask: (task) => set({ currentTask: task }),
      setTasks: (tasks) => set({ tasks }),
      clearTasks: () => set({ tasks: [], currentTask: null }),
    }),
    {
      name: 'sipp-web-manager-storage',
      partialize: (state) => ({
        testConfig: state.testConfig,
        currentScenario: state.currentScenario,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
);

export default useAppStore;
