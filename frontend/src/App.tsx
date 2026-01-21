import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntApp, message } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import Layout from '@/components/Layout';
import Scenarios from '@/pages/Scenarios';
import InjectionFiles from '@/pages/InjectionFiles';
import AudioFiles from '@/pages/AudioFiles';
import TaskHistory from '@/pages/TaskHistory';
import Machines from '@/pages/Machines';
import TLSCertificates from '@/pages/TLSCertificates';
import { useAppStore } from '@/stores/useAppStore';
import { wsService } from '@/services/websocket';
import { apiService } from '@/services/api';
import { TestTaskStatus } from '@/types';

/**
 * 主应用组件
 * 职责：配置路由和全局状态监听
 */
const App: React.FC = () => {
  const { updateTask } = useAppStore();

  useEffect(() => {
    const handleTaskCompleted = (data: any) => {
      console.log('Task completed:', data);
      const status = data.success ? TestTaskStatus.COMPLETED : TestTaskStatus.FAILED;
      const error = data.success ? undefined : `Exit code: ${data.exitCode}`;

      updateTask(data.taskId, {
        status,
        endTime: data.timestamp,
        error,
      });

      // 使用 setTimeout 确保 store 已更新
      setTimeout(() => {
        const task = useAppStore.getState().tasks.find(t => t.id === data.taskId);
        if (task) {
          apiService.updateTaskHistory(data.taskId, {
            status: status.toUpperCase() as any,
            end_time: data.timestamp,
            error,
            stats: task.stats,
          }).catch(err => {
            console.error('Failed to save task history:', err);
          });
        }
      }, 0);
    };

    const handleTaskFailed = (data: any) => {
      console.log('Task failed:', data);
      updateTask(data.taskId, {
        status: TestTaskStatus.FAILED,
        endTime: data.timestamp,
        error: data.error,
      });

      setTimeout(() => {
        const task = useAppStore.getState().tasks.find(t => t.id === data.taskId);
        if (task) {
          apiService.updateTaskHistory(data.taskId, {
            status: 'FAILED',
            end_time: data.timestamp,
            error: data.error,
            stats: task.stats,
          }).catch(err => {
            console.error('Failed to save task history:', err);
          });
        }
      }, 0);
    };

    const handleTaskStopped = (data: any) => {
      console.log('Task stopped:', data);
      updateTask(data.taskId, {
        status: TestTaskStatus.STOPPED,
        endTime: data.timestamp,
      });

      setTimeout(() => {
        const task = useAppStore.getState().tasks.find(t => t.id === data.taskId);
        if (task) {
          apiService.updateTaskHistory(data.taskId, {
            status: 'STOPPED',
            end_time: data.timestamp,
            stats: task.stats,
          }).catch(err => {
            console.error('Failed to save task history:', err);
          });
        }
      }, 0);
    };

    const handleCommandSuccess = (data: any) => {
      message.success(`命令执行成功: ${data.command}`);
    };

    const handleCommandError = (data: any) => {
      message.error(`命令执行失败: ${data.error}`);
    };

    const handleSippMessage = (data: any) => {
      console.log('SIPp Message:', data);
    };

    const handleSippError = (data: any) => {
      message.error(`SIPp错误: ${data.error}`);
    };

    // 注册所有监听器
    wsService.on('task:completed', handleTaskCompleted);
    wsService.on('task:failed', handleTaskFailed);
    wsService.on('task:stopped', handleTaskStopped);
    wsService.on('command:success', handleCommandSuccess);
    wsService.on('command:error', handleCommandError);
    wsService.on('sipp:message', handleSippMessage);
    wsService.on('sipp:error', handleSippError);

    return () => {
      // 清理所有监听器
      wsService.off('task:completed', handleTaskCompleted);
      wsService.off('task:failed', handleTaskFailed);
      wsService.off('task:stopped', handleTaskStopped);
      wsService.off('command:success', handleCommandSuccess);
      wsService.off('command:error', handleCommandError);
      wsService.off('sipp:message', handleSippMessage);
      wsService.off('sipp:error', handleSippError);
    };
  }, []);

  return (
    <ConfigProvider locale={zhCN}>
      <AntApp>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Navigate to="/scenarios" replace />} />
              <Route path="scenarios" element={<Scenarios />} />
              <Route path="injection-files" element={<InjectionFiles />} />
              <Route path="audio-files" element={<AudioFiles />} />
              <Route path="task-history" element={<TaskHistory />} />
              <Route path="machines" element={<Machines />} />
              <Route path="tls-certificates" element={<TLSCertificates />} />
              <Route path="*" element={<Navigate to="/scenarios" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
};

export default App;
