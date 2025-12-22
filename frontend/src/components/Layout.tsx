import React, { useEffect } from 'react';
import { Layout as AntLayout, Menu, theme, Badge, Space, Typography, Dropdown } from 'antd';
import {
  FileTextOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  WifiOutlined,
  DatabaseOutlined,
  HistoryOutlined,
  GlobalOutlined,
  ClusterOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAppStore } from '@/stores/useAppStore';
import { wsService } from '@/services/websocket';
import { useTranslation } from 'react-i18next';

const { Header, Sider, Content } = AntLayout;
const { Text } = Typography;

/**
 * 应用布局组件
 * 职责：提供统一的应用布局和导航
 */
const Layout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { sidebarCollapsed, toggleSidebar, connectionStatus, setConnectionStatus } = useAppStore();
  const { t, i18n } = useTranslation();

  const {
    token: { colorBgContainer },
  } = theme.useToken();

  useEffect(() => {
    // 连接WebSocket - 动态获取后端地址
    // 在开发环境中，如果通过IP访问前端，则使用相同IP连接后端
    const wsPort = import.meta.env.VITE_WS_PORT || '3000';
    const backendUrl = window.location.hostname === 'localhost'
      ? `http://localhost:${wsPort}`
      : `http://${window.location.hostname}:${wsPort}`;

    wsService.connect(backendUrl);

    // 监听连接状态
    const handleConnection = (data: any) => {
      setConnectionStatus(data.status);
    };

    wsService.on('connection', handleConnection);

    return () => {
      wsService.off('connection', handleConnection);
      wsService.disconnect();
    };
  }, []);

  /**
   * 切换语言
   */
  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('language', lang);
  };

  /**
   * 语言菜单
   */
  const languageMenu = {
    items: [
      { key: 'zh-CN', label: '中文' },
      { key: 'en-US', label: 'English' },
    ],
    onClick: ({ key }: { key: string }) => changeLanguage(key),
  };

  /**
   * 菜单项配置
   */
  const menuItems = [
    {
      key: '/scenarios',
      icon: <FileTextOutlined />,
      label: t('menu.scenarios'),
    },
    {
      key: '/injection-files',
      icon: <DatabaseOutlined />,
      label: t('menu.injectionFiles'),
    },
    {
      key: '/task-history',
      icon: <HistoryOutlined />,
      label: t('menu.taskHistory'),
    },
    {
      key: '/machines',
      icon: <ClusterOutlined />,
      label: '从机管理',
    },
  ];

  /**
   * 处理菜单点击
   */
  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  /**
   * 获取连接状态颜色
   */
  const getConnectionColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return '#52c41a';
      case 'connecting':
        return '#faad14';
      case 'error':
        return '#f5222d';
      default:
        return '#d9d9d9';
    }
  };

  /**
   * 获取连接状态文本
   */
  const getConnectionText = () => {
    switch (connectionStatus) {
      case 'connected':
        return t('connection.connected');
      case 'connecting':
        return t('connection.connecting');
      case 'error':
        return t('connection.error');
      default:
        return t('connection.disconnected');
    }
  };

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider trigger={null} collapsible collapsed={sidebarCollapsed} theme="light">
        <div
          style={{
            height: '64px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            fontWeight: 'bold',
            color: '#1890ff',
          }}
        >
          {sidebarCollapsed ? 'SIPp' : 'SIPp Manager'}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
        />
      </Sider>
      <AntLayout>
        <Header style={{ padding: 0, background: colorBgContainer, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '24px' }}>
          <Space>
            {React.createElement(sidebarCollapsed ? MenuUnfoldOutlined : MenuFoldOutlined, {
              className: 'trigger',
              onClick: toggleSidebar,
              style: { fontSize: '18px', padding: '0 24px', cursor: 'pointer' },
            })}
          </Space>
          <Space size="middle">
            <Badge color={getConnectionColor()} text={<Text>{getConnectionText()}</Text>} />
            <WifiOutlined style={{ fontSize: '20px', color: getConnectionColor() }} />
            <Dropdown menu={languageMenu} placement="bottomRight">
              <GlobalOutlined style={{ fontSize: '18px', cursor: 'pointer' }} />
            </Dropdown>
          </Space>
        </Header>
        <Content
          style={{
            margin: 0,
            minHeight: 280,
            background: '#f0f2f5',
          }}
        >
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  );
};

export default Layout;
