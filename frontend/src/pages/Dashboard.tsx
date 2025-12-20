import React, { useEffect } from 'react';
import { Card, Row, Col, Statistic, Space, Tag, Alert, Descriptions } from 'antd';
import {
  PhoneOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { useAppStore } from '@/stores/useAppStore';
import { wsService } from '@/services/websocket';
import { TestTaskStatus } from '@/types';
import type { EChartsOption } from 'echarts';

/**
 * 实时监控面板
 * 职责：显示当前运行任务的实时统计数据和图表
 */
const Dashboard: React.FC = () => {
  const { stats, csvStats, tasks } = useAppStore();

  useEffect(() => {
    // 定时请求统计数据
    const interval = setInterval(() => {
      if (wsService.isConnected()) {
        wsService.requestStats();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // 获取当前运行的任务
  const runningTask = tasks.find(task => task.status === TestTaskStatus.RUNNING);

  /**
   * 获取呼叫速率图表配置
   */
  const getCallRateChartOption = (): EChartsOption => {
    const data = csvStats.slice(-60).map((row) => ({
      time: new Date(row.timestamp).toLocaleTimeString(),
      rate: row.callRate,
    }));

    return {
      title: {
        text: '呼叫速率趋势',
        left: 'center',
      },
      tooltip: {
        trigger: 'axis',
      },
      xAxis: {
        type: 'category',
        data: data.map((d) => d.time),
      },
      yAxis: {
        type: 'value',
        name: '呼叫/秒',
      },
      series: [
        {
          name: '呼叫速率',
          type: 'line',
          smooth: true,
          data: data.map((d) => d.rate),
          areaStyle: {
            opacity: 0.3,
          },
        },
      ],
    };
  };

  /**
   * 获取呼叫统计图表配置
   */
  const getCallStatsChartOption = (): EChartsOption => {
    const latestStats = csvStats[csvStats.length - 1];

    if (!latestStats) {
      return {};
    }

    return {
      title: {
        text: '呼叫统计',
        left: 'center',
      },
      tooltip: {
        trigger: 'item',
      },
      series: [
        {
          name: '呼叫统计',
          type: 'pie',
          radius: '50%',
          data: [
            { value: latestStats.successCalls, name: '成功' },
            { value: latestStats.failedCalls, name: '失败' },
            { value: latestStats.currentCalls, name: '进行中' },
          ],
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
            },
          },
        },
      ],
    };
  };

  // 从stats或csvStats获取最新数据
  const latestStats = stats || (csvStats.length > 0 ? csvStats[csvStats.length - 1] : null);

  const successRate = latestStats
    ? latestStats.successCalls
      ? ((latestStats.successCalls / latestStats.totalCalls) * 100).toFixed(2)
      : 0
    : 0;

  return (
    <div style={{ padding: '24px' }}>
      {/* 当前运行任务信息 */}
      {runningTask ? (
        <Alert
          message={
            <Space>
              <PlayCircleOutlined />
              <span>正在运行:</span>
              <Tag color="blue">{runningTask.scenarioName}</Tag>
              <span style={{ fontSize: '12px', color: '#999' }}>
                {runningTask.scenarioFile}
              </span>
            </Space>
          }
          description={
            <Descriptions size="small" column={4}>
              <Descriptions.Item label="速率">{runningTask.config.rate} calls/s</Descriptions.Item>
              <Descriptions.Item label="并发">{runningTask.config.users}</Descriptions.Item>
              <Descriptions.Item label="目标">{runningTask.config.remoteHost}:{runningTask.config.remotePort}</Descriptions.Item>
              <Descriptions.Item label="协议">{runningTask.config.transport.toUpperCase()}</Descriptions.Item>
            </Descriptions>
          }
          type="info"
          showIcon={false}
          style={{ marginBottom: '16px' }}
        />
      ) : (
        <Alert
          message="当前没有运行中的任务"
          description="请前往场景管理页面启动测试任务"
          type="warning"
          showIcon
          style={{ marginBottom: '16px' }}
        />
      )}

      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="呼叫速率"
              value={latestStats?.callRate || 0}
              precision={2}
              suffix="cps"
              prefix={<PhoneOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="活跃呼叫"
              value={latestStats?.currentCalls || 0}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="成功呼叫"
              value={latestStats?.successCalls || 0}
              valueStyle={{ color: '#3f8600' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="成功率"
              value={successRate}
              precision={2}
              suffix="%"
              valueStyle={{ color: Number(successRate) >= 95 ? '#3f8600' : '#cf1322' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* 图表 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card>
            {csvStats.length > 0 ? (
              <ReactECharts option={getCallRateChartOption()} style={{ height: '400px' }} />
            ) : (
              <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                暂无数据
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card>
            {csvStats.length > 0 ? (
              <ReactECharts option={getCallStatsChartOption()} style={{ height: '400px' }} />
            ) : (
              <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                暂无数据
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* 详细统计 */}
      <Card title="详细统计" style={{ marginTop: '24px' }}>
        <Row gutter={[16, 16]}>
          <Col xs={12} sm={8} md={6}>
            <Statistic title="总呼叫" value={latestStats?.totalCalls || 0} />
          </Col>
          <Col xs={12} sm={8} md={6}>
            <Statistic
              title="失败呼叫"
              value={latestStats?.failedCalls || 0}
              valueStyle={{ color: '#cf1322' }}
              prefix={<CloseCircleOutlined />}
            />
          </Col>
          {runningTask && (
            <>
              <Col xs={12} sm={8} md={6}>
                <Statistic title="目标速率" value={runningTask.config.rate} suffix="cps" />
              </Col>
              <Col xs={12} sm={8} md={6}>
                <Statistic title="并发用户" value={runningTask.config.users} />
              </Col>
            </>
          )}
        </Row>
      </Card>
    </div>
  );
};

export default Dashboard;
