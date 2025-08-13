"use client";

import React, { useState, useEffect } from 'react';
import { 
  Card, 
  CardBody, 
  CardHeader,
  Progress,
  Chip,
  Button,
  Avatar,
  Tabs,
  Tab,
  Switch,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  useDisclosure
} from '@heroui/react';
import { 
  Activity, 
  Server, 
  Users, 
  Globe, 
  TrendingUp, 
  AlertTriangle, 
  Wifi, 
  Database,
  Clock,
  Shield,
  Settings,
  BarChart3,
  Map,
  Bell,
  RefreshCw,
  Download,
  Upload,
  Zap,
  Heart,
  Eye,
  Filter
} from 'lucide-react';

// 模拟实时数据
const useRealtimeData = () => {
  const [data, setData] = useState({
    activeConnections: 1247,
    totalBandwidth: 8.2,
    onlineTunnels: 23,
    systemHealth: 98,
    cpuUsage: 65,
    memoryUsage: 72,
    networkLatency: 45,
    uptime: '15天 8小时',
    errorRate: 0.3
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setData(prev => ({
        ...prev,
        activeConnections: prev.activeConnections + Math.floor(Math.random() * 10 - 5),
        totalBandwidth: Math.max(0, prev.totalBandwidth + (Math.random() - 0.5) * 0.5),
        cpuUsage: Math.max(0, Math.min(100, prev.cpuUsage + Math.floor(Math.random() * 6 - 3))),
        memoryUsage: Math.max(0, Math.min(100, prev.memoryUsage + Math.floor(Math.random() * 4 - 2))),
        networkLatency: Math.max(10, prev.networkLatency + Math.floor(Math.random() * 10 - 5))
      }));
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return data;
};

// 仪表板卡片组件
const DashboardCard = ({ title, value, subtitle, icon: Icon, color = "primary", trend, onClick }) => (
  <Card 
    className="p-4 hover:shadow-lg transition-all duration-300 cursor-pointer group"
    isPressable
    onPress={onClick}
  >
    <CardBody className="p-0">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Icon className={`w-5 h-5 text-${color}-500`} />
            <span className="text-sm text-default-500 font-medium">{title}</span>
          </div>
          <div className="text-2xl font-bold text-default-900 mb-1">{value}</div>
          {subtitle && (
            <div className="text-sm text-default-400">{subtitle}</div>
          )}
          {trend && (
            <div className={`text-xs mt-1 flex items-center gap-1 ${trend.positive ? 'text-success-500' : 'text-danger-500'}`}>
              <TrendingUp className={`w-3 h-3 ${trend.positive ? '' : 'rotate-180'}`} />
              {trend.value}
            </div>
          )}
        </div>
        <div className={`w-12 h-12 rounded-full bg-${color}-100 flex items-center justify-center group-hover:scale-110 transition-transform`}>
          <Icon className={`w-6 h-6 text-${color}-500`} />
        </div>
      </div>
    </CardBody>
  </Card>
);

// 流量图表组件
const TrafficChart = () => {
  const [timeRange, setTimeRange] = useState('24h');
  
  // 模拟流量数据
  const chartData = Array.from({ length: 24 }, (_, i) => ({
    time: `${i}:00`,
    upload: Math.random() * 100 + 20,
    download: Math.random() * 150 + 30
  }));

  return (
    <Card className="p-6">
      <CardHeader className="pb-4">
        <div className="flex justify-between items-center w-full">
          <div>
            <h3 className="text-lg font-semibold">实时流量监控</h3>
            <p className="text-sm text-default-500">上传/下载带宽使用情况</p>
          </div>
          <div className="flex gap-2">
            <Tabs size="sm" selectedKey={timeRange} onSelectionChange={setTimeRange}>
              <Tab key="1h" title="1小时" />
              <Tab key="24h" title="24小时" />
              <Tab key="7d" title="7天" />
            </Tabs>
          </div>
        </div>
      </CardHeader>
      <CardBody>
        <div className="h-64 bg-gradient-to-br from-primary-50 to-secondary-50 rounded-lg p-4 relative overflow-hidden">
          {/* 简化的图表视觉表示 */}
          <div className="absolute inset-0 flex items-end justify-around p-4">
            {chartData.slice(0, 12).map((item, index) => (
              <div key={index} className="flex flex-col items-center gap-1">
                <div className="flex flex-col gap-1 items-center">
                  <div 
                    className="w-3 bg-primary-400 rounded-t"
                    style={{ height: `${item.upload}px` }}
                  />
                  <div 
                    className="w-3 bg-secondary-400 rounded-t"
                    style={{ height: `${item.download}px` }}
                  />
                </div>
                <span className="text-xs text-default-400">{item.time}</span>
              </div>
            ))}
          </div>
          
          {/* 图例 */}
          <div className="absolute top-4 right-4 flex gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-primary-400 rounded"></div>
              <span className="text-xs">上传</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-secondary-400 rounded"></div>
              <span className="text-xs">下载</span>
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
};

// 节点状态地图组件
const NodeMap = () => {
  const nodes = [
    { id: 1, name: '北京节点', status: 'online', connections: 245, latency: 12, x: 70, y: 30 },
    { id: 2, name: '上海节点', status: 'online', connections: 189, latency: 8, x: 72, y: 45 },
    { id: 3, name: '广州节点', status: 'warning', connections: 156, latency: 25, x: 65, y: 65 },
    { id: 4, name: '新加坡节点', status: 'online', connections: 298, latency: 45, x: 60, y: 80 },
    { id: 5, name: '东京节点', status: 'offline', connections: 0, latency: 0, x: 85, y: 35 }
  ];

  const getStatusColor = (status) => {
    switch (status) {
      case 'online': return 'success';
      case 'warning': return 'warning';
      case 'offline': return 'danger';
      default: return 'default';
    }
  };

  return (
    <Card className="p-6">
      <CardHeader>
        <div className="flex justify-between items-center w-full">
          <div>
            <h3 className="text-lg font-semibold">全球节点分布</h3>
            <p className="text-sm text-default-500">实时节点状态与连接情况</p>
          </div>
          <Button size="sm" variant="flat" startContent={<RefreshCw className="w-4 h-4" />}>
            刷新
          </Button>
        </div>
      </CardHeader>
      <CardBody>
        <div className="h-80 bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg relative overflow-hidden">
          {/* 简化的世界地图背景 */}
          <div className="absolute inset-0 opacity-10">
            <Globe className="w-full h-full text-default-400" />
          </div>
          
          {/* 节点标记 */}
          {nodes.map((node) => (
            <div
              key={node.id}
              className="absolute transform -translate-x-1/2 -translate-y-1/2 group cursor-pointer"
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
            >
              <div className={`w-4 h-4 rounded-full bg-${getStatusColor(node.status)}-500 border-2 border-white shadow-lg animate-pulse`}>
                {node.status === 'online' && (
                  <div className={`absolute inset-0 rounded-full bg-${getStatusColor(node.status)}-400 animate-ping`}></div>
                )}
              </div>
              
              {/* 悬浮信息卡 */}
              <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded-lg shadow-lg p-3 min-w-32 z-10">
                <div className="text-sm font-medium">{node.name}</div>
                <div className="text-xs text-default-500 mt-1">
                  <div>连接: {node.connections}</div>
                  <div>延迟: {node.latency}ms</div>
                </div>
                <Chip 
                  size="sm" 
                  color={getStatusColor(node.status)}
                  className="mt-2"
                >
                  {node.status}
                </Chip>
              </div>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
};

// 活动日志组件
const ActivityLog = () => {
  const activities = [
    { id: 1, type: 'connection', message: '新连接建立', user: 'user_001', time: '2分钟前', status: 'success' },
    { id: 2, type: 'warning', message: '广州节点延迟异常', user: 'system', time: '5分钟前', status: 'warning' },
    { id: 3, type: 'tunnel', message: '隧道 tunnel_005 已启动', user: 'admin', time: '8分钟前', status: 'success' },
    { id: 4, type: 'error', message: '东京节点连接失败', user: 'system', time: '12分钟前', status: 'danger' },
    { id: 5, type: 'info', message: '系统配置已更新', user: 'admin', time: '15分钟前', status: 'primary' }
  ];

  const getIcon = (type) => {
    switch (type) {
      case 'connection': return <Wifi className="w-4 h-4" />;
      case 'warning': return <AlertTriangle className="w-4 h-4" />;
      case 'tunnel': return <Globe className="w-4 h-4" />;
      case 'error': return <AlertTriangle className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  return (
    <Card className="p-6">
      <CardHeader>
        <div className="flex justify-between items-center w-full">
          <div>
            <h3 className="text-lg font-semibold">活动日志</h3>
            <p className="text-sm text-default-500">最近系统活动和事件</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="flat" startContent={<Filter className="w-4 h-4" />}>
              筛选
            </Button>
            <Button size="sm" variant="flat" startContent={<Eye className="w-4 h-4" />}>
              查看全部
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardBody>
        <div className="space-y-4">
          {activities.map((activity) => (
            <div key={activity.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-default-50 transition-colors">
              <div className={`p-2 rounded-full bg-${activity.status}-100`}>
                <div className={`text-${activity.status}-600`}>
                  {getIcon(activity.type)}
                </div>
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">{activity.message}</div>
                <div className="text-xs text-default-500">
                  {activity.user} · {activity.time}
                </div>
              </div>
              <Chip size="sm" color={activity.status} variant="flat">
                {activity.status}
              </Chip>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
};

// 主仪表板组件
export default function EnhancedNodePassDashboard() {
  const data = useRealtimeData();
  const [darkMode, setDarkMode] = useState(false);
  const { isOpen, onOpen, onClose } = useDisclosure();

  return (
    <div className={`min-h-screen ${darkMode ? 'dark' : ''} bg-background`}>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* 顶部导航栏 */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-default-900 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-lg flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </div>
              NodePass Dashboard
            </h1>
            <p className="text-default-500 mt-1">高性能隧道管理系统 · 实时监控与分析</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm">深色模式</span>
              <Switch isSelected={darkMode} onValueChange={setDarkMode} />
            </div>
            <Button color="primary" startContent={<Bell className="w-4 h-4" />} onPress={onOpen}>
              通知 (3)
            </Button>
            <Avatar src="/api/placeholder/32/32" size="sm" />
          </div>
        </div>

        {/* 系统状态概览 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <DashboardCard
            title="活跃连接"
            value={data.activeConnections.toLocaleString()}
            subtitle="实时连接数"
            icon={Users}
            color="primary"
            trend={{ positive: true, value: "+12.5%" }}
          />
          <DashboardCard
            title="总带宽"
            value={`${data.totalBandwidth.toFixed(1)} GB/s`}
            subtitle="实时流量"
            icon={Activity}
            color="secondary"
            trend={{ positive: true, value: "+8.2%" }}
          />
          <DashboardCard
            title="在线隧道"
            value={data.onlineTunnels}
            subtitle={`系统健康度 ${data.systemHealth}%`}
            icon={Globe}
            color="success"
          />
          <DashboardCard
            title="系统负载"
            value={`${data.cpuUsage}%`}
            subtitle={`内存 ${data.memoryUsage}% · 运行 ${data.uptime}`}
            icon={Server}
            color="warning"
          />
        </div>

        {/* 性能监控面板 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="p-6">
            <CardHeader>
              <h3 className="text-lg font-semibold">系统性能</h3>
            </CardHeader>
            <CardBody className="space-y-6">
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm">CPU 使用率</span>
                  <span className="text-sm font-medium">{data.cpuUsage}%</span>
                </div>
                <Progress value={data.cpuUsage} color="primary" size="sm" />
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm">内存使用率</span>
                  <span className="text-sm font-medium">{data.memoryUsage}%</span>
                </div>
                <Progress value={data.memoryUsage} color="secondary" size="sm" />
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm">网络延迟</span>
                  <span className="text-sm font-medium">{data.networkLatency}ms</span>
                </div>
                <Progress value={data.networkLatency} maxValue={100} color="success" size="sm" />
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm">错误率</span>
                  <span className="text-sm font-medium">{data.errorRate}%</span>
                </div>
                <Progress value={data.errorRate} maxValue={5} color="danger" size="sm" />
              </div>
            </CardBody>
          </Card>

          <Card className="p-6">
            <CardHeader>
              <h3 className="text-lg font-semibold">快速操作</h3>
            </CardHeader>
            <CardBody className="space-y-3">
              <Button fullWidth variant="flat" startContent={<Globe className="w-4 h-4" />}>
                创建新隧道
              </Button>
              <Button fullWidth variant="flat" startContent={<Settings className="w-4 h-4" />}>
                系统配置
              </Button>
              <Button fullWidth variant="flat" startContent={<BarChart3 className="w-4 h-4" />}>
                生成报告
              </Button>
              <Button fullWidth variant="flat" startContent={<Shield className="w-4 h-4" />}>
                安全设置
              </Button>
            </CardBody>
          </Card>

          <Card className="p-6">
            <CardHeader>
              <h3 className="text-lg font-semibold">今日统计</h3>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-primary-500" />
                  <span className="text-sm">下载流量</span>
                </div>
                <span className="font-medium">2.8 TB</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-secondary-500" />
                  <span className="text-sm">上传流量</span>
                </div>
                <span className="font-medium">1.2 TB</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-warning-500" />
                  <span className="text-sm">新建连接</span>
                </div>
                <span className="font-medium">1,247</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Heart className="w-4 h-4 text-danger-500" />
                  <span className="text-sm">心跳检测</span>
                </div>
                <span className="font-medium">98.9%</span>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* 流量监控和节点地图 */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <TrafficChart />
          <NodeMap />
        </div>

        {/* 活动日志 */}
        <ActivityLog />

        {/* 通知模态框 */}
        <Modal isOpen={isOpen} onClose={onClose} size="2xl">
          <ModalContent>
            <ModalHeader>系统通知</ModalHeader>
            <ModalBody className="pb-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-warning-50 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-warning-500 mt-0.5" />
                  <div>
                    <div className="font-medium">广州节点延迟异常</div>
                    <div className="text-sm text-default-600 mt-1">
                      检测到广州节点平均延迟超过阈值，建议检查网络连接
                    </div>
                    <div className="text-xs text-default-400 mt-2">5分钟前</div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 bg-success-50 rounded-lg">
                  <Zap className="w-5 h-5 text-success-500 mt-0.5" />
                  <div>
                    <div className="font-medium">系统性能优化完成</div>
                    <div className="text-sm text-default-600 mt-1">
                      系统性能优化已完成，预计可提升20%的处理效率
                    </div>
                    <div className="text-xs text-default-400 mt-2">1小时前</div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 bg-primary-50 rounded-lg">
                  <Shield className="w-5 h-5 text-primary-500 mt-0.5" />
                  <div>
                    <div className="font-medium">安全更新可用</div>
                    <div className="text-sm text-default-600 mt-1">
                      发现新的安全更新，建议尽快应用以确保系统安全
                    </div>
                    <div className="text-xs text-default-400 mt-2">2小时前</div>
                  </div>
                </div>
              </div>
            </ModalBody>
          </ModalContent>
        </Modal>
      </div>
    </div>
  );
}