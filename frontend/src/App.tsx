import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntApp, message } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Scenarios from '@/pages/Scenarios';
import Config from '@/pages/Config';
import InjectionFiles from '@/pages/InjectionFiles';
import TaskHistory from '@/pages/TaskHistory';
import { useAppStore } from '@/stores/useAppStore';
import { wsService } from '@/services/websocket';

/**
 * 主应用组件
 * 职责：配置路由和全局状态监听
 */
const App: React.FC = () => {
  const { addCsvStats, setStats } = useAppStore();

  useEffect(() => {
    // 监听统计数据更新
    wsService.on('stats:update', (stats) => {
      setStats(stats);
    });

    // 监听CSV数据更新
    wsService.on('stats:csv', (row) => {
      addCsvStats(row);
    });

    // 监听命令执行结果
    wsService.on('command:success', (data) => {
      message.success(`命令执行成功: ${data.command}`);
    });

    wsService.on('command:error', (data) => {
      message.error(`命令执行失败: ${data.error}`);
    });

    // 监听SIPp消息
    wsService.on('sipp:message', (data) => {
      console.log('SIPp Message:', data);
    });

    wsService.on('sipp:error', (data) => {
      message.error(`SIPp错误: ${data.error}`);
    });

    return () => {
      // 清理监听器
      wsService.off('stats:update', setStats);
      wsService.off('stats:csv', addCsvStats);
    };
  }, []);

  return (
    <ConfigProvider locale={zhCN}>
      <AntApp>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="scenarios" element={<Scenarios />} />
              <Route path="injection-files" element={<InjectionFiles />} />
              <Route path="task-history" element={<TaskHistory />} />
              <Route path="config" element={<Config />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
};

export default App;
