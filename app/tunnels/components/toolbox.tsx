'use client';

import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Input,
  Spinner
} from "@heroui/react";
import React, { useState, useEffect } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { 
  faSearch, 
  faChevronDown, 
  faPlus,
  faCheck,
  faEllipsisV,
  faStop,
  faPlay,
  faRotateRight,
  faTrash,
  faLayerGroup,
  faBolt,
  faCopy,
  faDownload,
  faHammer,
  faTag,
  faRecycle,
} from "@fortawesome/free-solid-svg-icons";
import { useRouter } from "next/navigation";
import { Box, Flex } from "@/components";
import { addToast } from "@heroui/toast";
import QuickCreateTunnelModal from "./quick-create-tunnel-modal";
import BatchCreateModal from "./batch-create-modal";
import { ButtonGroup } from "@heroui/react";
import ManualCreateTunnelModal from "./manual-create-tunnel-modal";

type EndpointStatus = 'ONLINE' | 'OFFLINE' | 'FAIL';

interface ApiEndpoint {
  id: number;
  name: string;
  url: string;
  status: EndpointStatus;
  tunnelCount: number;
  version: string;
  tls: string;
  log: string;
  crt: string;
  keyPath: string;
}

interface TunnelToolBoxProps {
  filterValue: string;
  statusFilter: string;
  endpointFilter?: string;
  loading?: boolean;
  onSearchChange: (value?: string) => void;
  onClear: () => void;
  onStatusFilterChange: (status: string) => void;
  onEndpointFilterChange?: (endpointId: string) => void;
  onRefresh?: () => void;
  selectedCount?: number;
  onBulkAction?: (action: string) => void;
  onTagManagement?: () => void;
}

export const TunnelToolBox: React.FC<TunnelToolBoxProps> = ({
  filterValue,
  statusFilter,
  endpointFilter = "all",
  loading = false,
  onSearchChange,
  onClear,
  onStatusFilterChange,
  onEndpointFilterChange,
  onRefresh,
  selectedCount = 0,
  onBulkAction,
  onTagManagement,
}) => {
  const router = useRouter();
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>([]);
  const [endpointsLoading, setEndpointsLoading] = useState(true);

  // 快速创建模态
  const [isNormalOpen, setIsNormalOpen] = useState(false);

  // 批量创建模态
  const [isBatchOpen, setIsBatchOpen] = useState(false);

  // 手搓创建模态控制
  const [manualCreateOpen, setManualCreateOpen] = useState(false);

  useEffect(() => {
    const fetchEndpoints = async () => {
      try {
        const response = await fetch('/api/endpoints/simple');
        if (!response.ok) throw new Error('获取主控列表失败');
        const data = await response.json();
        setEndpoints(data);
      } catch (error) {
        console.error('获取主控列表失败:', error);
      } finally {
        setEndpointsLoading(false);
      }
    };

    fetchEndpoints();
  }, []);

  const statusOptions = [
    { label: "所有状态", value: "all" },
    { label: "运行中", value: "running" },
    { label: "已停止", value: "stopped" },
    { label: "错误", value: "error" },
    { label: "离线", value: "offline" },
  ];

  const getSelectedEndpointName = () => {
    if (endpointFilter === "all") return "所有主控";
    const endpoint = endpoints.find(ep => String(ep.id) === String(endpointFilter));
    return endpoint ? endpoint.name : "所有主控";
  };

  return (
    <div className="px-3 md:px-4 py-3 w-full">
      {/* 桌面端：单行布局 */}
      <div className="hidden lg:flex flex-row gap-4 items-center">
        {/* 左侧：搜索框和过滤器 */}
        <Flex className="gap-2 flex-wrap flex-1">
          <h1 className="text-xl md:text-2xl font-bold">实例管理</h1>
          {/* 搜索框 */}
          <Box className="flex-1 sm:max-w-xs lg:max-w-sm">
            <Input
              isClearable
              classNames={{
                inputWrapper: "bg-default-100",
              }}
              placeholder="搜索实例..."
              startContent={<FontAwesomeIcon icon={faSearch} className="text-default-400 text-sm" />}
              value={filterValue}
              onClear={() => onClear()}
              onValueChange={onSearchChange}
              isDisabled={loading}
            />
          </Box>

          {/* 主控过滤器 */}
          <Dropdown>
            <DropdownTrigger>
              <Button 
                variant="flat" 
                className="min-w-0 flex-shrink-0"
                endContent={
                  endpointsLoading || loading ? 
                    <Spinner size="sm" /> : 
                    <FontAwesomeIcon icon={faChevronDown} className="text-xs" />
                }
                isDisabled={endpointsLoading || loading}
              >
                <span className="truncate max-w-[120px] sm:max-w-[150px]">
                  {getSelectedEndpointName()}
                </span>
              </Button>
            </DropdownTrigger>
            <DropdownMenu 
              aria-label="主控过滤"
              onAction={(key) => onEndpointFilterChange?.(key as string)}
              selectedKeys={[endpointFilter]}
              selectionMode="single"
              className="max-w-[280px]"
              items={[
                { key: "all", label: "所有主控", count: endpoints.reduce((total, ep) => total + ep.tunnelCount, 0) },
                ...endpoints.map((endpoint) => ({
                  key: endpoint.id,
                  label: endpoint.name,
                  status: endpoint.status,
                  count: endpoint.tunnelCount
                }))
              ]}
            >
              {(item: any) => (
                <DropdownItem key={item.key} className="text-sm">
                  <Flex align="center" justify="between" className="w-full">
                    {item.key === "all" ? (
                      <>
                        <span>所有主控</span>
                        <span className="text-xs text-default-400">
                        </span>
                      </>
                    ) : (
                      <>
                        <Flex align="center" className="gap-2 min-w-0 flex-1">
                          <span 
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              item.status === 'ONLINE' ? 'bg-success' : 'bg-danger'
                            }`} 
                          />
                          <span className="truncate">{item.label}</span>
                        </Flex>
                        <span className="text-xs text-default-400 flex-shrink-0 ml-2">
                          {item.count} 个实例
                        </span>
                      </>
                    )}
                  </Flex>
                </DropdownItem>
              )}
            </DropdownMenu>
          </Dropdown>

          {/* 状态过滤器 */}
          <Dropdown>
            <DropdownTrigger>
              <Button 
                variant="flat" 
                className="min-w-0 flex-shrink-0"
                endContent={loading ? <Spinner size="sm" /> : <FontAwesomeIcon icon={faChevronDown} className="text-xs" />}
                isDisabled={loading}
              >
                <span className="truncate max-w-[100px] sm:max-w-[120px]">
                  {statusOptions.find(option => option.value === statusFilter)?.label || "所有状态"}
                </span>
              </Button>
            </DropdownTrigger>
            <DropdownMenu 
              aria-label="状态过滤"
              onAction={(key) => onStatusFilterChange(key as string)}
              selectedKeys={[statusFilter]}
              selectionMode="single"
            >
              {statusOptions.map((status) => (
                <DropdownItem key={status.value} className="text-sm">
                  <Flex align="center" className="gap-2">
                    <Box>{status.label}</Box>
                  </Flex>
                </DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
        </Flex>

        {/* 右侧：操作按钮组 */}
        <Flex className="gap-2 flex-shrink-0">
          {/* 标签管理按钮 */}
          <Button 
            variant="flat"
            className="md:text-sm"
            color="secondary"
            startContent={<FontAwesomeIcon icon={faTag} />}
            onClick={onTagManagement}
            isDisabled={loading}
          >
            <span className="hidden sm:inline">标签</span>
            <span className="sm:hidden">标签</span>
          </Button>
          
          {/* 回收站按钮 */}
          <Button 
            variant="flat"
            className="md:text-sm"
            color="warning"
            startContent={<FontAwesomeIcon icon={faRecycle} />}
            onClick={() => router.push('/tunnels/recycle')}
            isDisabled={loading}
          >
            <span className="hidden sm:inline">回收站</span>
            <span className="sm:hidden">回收站</span>
          </Button>
          
          {/* 刷新按钮 */}
          <Button 
            variant="flat"
            className="md:text-sm"
            startContent={loading ? <Spinner size="sm" /> : <FontAwesomeIcon icon={faRotateRight} />}
            onClick={onRefresh}
            isDisabled={loading}
          >
            <span className="hidden sm:inline">刷新</span>
            <span className="sm:hidden">刷新</span>
          </Button>
          
          {/* 创建按钮组 - 按照 HeroUI Group Use case 样式 */}
          <ButtonGroup >
            <Button 
              color="primary" 
              className="md:text-sm"
              startContent={loading ? <Spinner size="sm" /> : <FontAwesomeIcon icon={faPlus} />}
              onClick={() => router.push("/tunnels/create")}
              isDisabled={loading}
            >
              <span className="hidden sm:inline">创建实例</span>
              <span className="sm:hidden">创建</span>
            </Button>
            <Dropdown placement="bottom-end">
              <DropdownTrigger>
            <Button
              isIconOnly
              color="primary"
              isDisabled={loading}
            >
                  <FontAwesomeIcon icon={faChevronDown} />
            </Button>
              </DropdownTrigger>
              <DropdownMenu 
                aria-label="创建选项"
                onAction={(key) => {
                  switch(key) {
                    case 'manual':
                      setManualCreateOpen(true);
                      break;
                    case 'normal':
                      setIsNormalOpen(true);
                      break;
                    case 'batch':
                      setIsBatchOpen(true);
                      break;
                    case 'template':
                      router.push('/templates');
                      break;
                  }
                }}
              >
                <DropdownItem key="normal" startContent={<FontAwesomeIcon icon={faBolt} fixedWidth />}>
                  快速创建
                </DropdownItem>
                <DropdownItem key="manual" startContent={<FontAwesomeIcon icon={faHammer} fixedWidth />}>
                  手搓创建
                </DropdownItem>
                <DropdownItem key="batch" startContent={<FontAwesomeIcon icon={faCopy} fixedWidth />}>
                  批量创建
                </DropdownItem>
                <DropdownItem key="template" startContent={<FontAwesomeIcon icon={faLayerGroup} fixedWidth />}>
                  场景创建
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </ButtonGroup>

          {/* 批量操作按钮 - 移动端隐藏 */}
          <Dropdown placement="bottom-end" className="hidden md:block">
            <DropdownTrigger>
              <Button
              className="hidden md:block"
                isIconOnly
                variant="flat"
                isDisabled={selectedCount === 0 || loading}
                title={selectedCount === 0 ? "请选择实例" : `已选择 ${selectedCount} 个实例`}
              >
                <FontAwesomeIcon icon={faEllipsisV} />
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="批量操作"
              onAction={(key) => onBulkAction?.(key as string)}
            >
              <DropdownItem key="start" startContent={<FontAwesomeIcon icon={faPlay} fixedWidth/>} className="text-success">
                批量启动
              </DropdownItem>
              <DropdownItem key="stop" startContent={<FontAwesomeIcon icon={faStop} fixedWidth/>} className="text-warning">
                批量停止
              </DropdownItem>
              <DropdownItem key="restart" startContent={<FontAwesomeIcon icon={faRotateRight} fixedWidth/>} className="text-secondary">
                批量重启
              </DropdownItem>
              <DropdownItem key="export" startContent={<FontAwesomeIcon icon={faDownload} fixedWidth/>} className="text-primary">
                批量导出
              </DropdownItem>
              <DropdownItem key="delete" startContent={<FontAwesomeIcon icon={faTrash} fixedWidth/>} className="text-danger">
                批量删除
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </Flex>
      </div>

      {/* 移动端：四行布局 */}
      <div className="lg:hidden space-y-3">
        {/* 第一行：实例管理label和搜索框 */}
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-bold">实例管理</h1>
          <Input
            isClearable
            classNames={{
              inputWrapper: "bg-default-100",
            }}
            placeholder="搜索实例..."
            startContent={<FontAwesomeIcon icon={faSearch} className="text-default-400 text-sm" />}
            value={filterValue}
            onClear={() => onClear()}
            onValueChange={onSearchChange}
            isDisabled={loading}
          />
        </div>

        {/* 第二行：主控和状态筛选 */}
        <div className="flex gap-2">
          {/* 主控过滤器 */}
          <Dropdown className="flex-1">
            <DropdownTrigger>
              <Button 
                variant="flat" 
                className="w-full"
                endContent={
                  endpointsLoading || loading ? 
                    <Spinner size="sm" /> : 
                    <FontAwesomeIcon icon={faChevronDown} className="text-xs" />
                }
                isDisabled={endpointsLoading || loading}
              >
                <span className="truncate">
                  {getSelectedEndpointName()}
                </span>
              </Button>
            </DropdownTrigger>
            <DropdownMenu 
              aria-label="主控过滤"
              onAction={(key) => onEndpointFilterChange?.(key as string)}
              selectedKeys={[endpointFilter]}
              selectionMode="single"
              className="max-w-[280px]"
              items={[
                { key: "all", label: "所有主控", count: endpoints.reduce((total, ep) => total + ep.tunnelCount, 0) },
                ...endpoints.map((endpoint) => ({
                  key: endpoint.id,
                  label: endpoint.name,
                  status: endpoint.status,
                  count: endpoint.tunnelCount
                }))
              ]}
            >
              {(item: any) => (
                <DropdownItem key={item.key} className="text-sm">
                  <Flex align="center" justify="between" className="w-full">
                    {item.key === "all" ? (
                      <>
                        <span>所有主控</span>
                        <span className="text-xs text-default-400">
                        </span>
                      </>
                    ) : (
                      <>
                        <Flex align="center" className="gap-2 min-w-0 flex-1">
                          <span 
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              item.status === 'ONLINE' ? 'bg-success' : 'bg-danger'
                            }`} 
                          />
                          <span className="truncate">{item.label}</span>
                        </Flex>
                        <span className="text-xs text-default-400 flex-shrink-0 ml-2">
                          {item.count} 个实例
                        </span>
                      </>
                    )}
                  </Flex>
                </DropdownItem>
              )}
            </DropdownMenu>
          </Dropdown>

          {/* 状态过滤器 */}
          <Dropdown className="flex-1">
            <DropdownTrigger>
              <Button 
                variant="flat" 
                className="w-full"
                endContent={loading ? <Spinner size="sm" /> : <FontAwesomeIcon icon={faChevronDown} className="text-xs" />}
                isDisabled={loading}
              >
                <span className="truncate">
                  {statusOptions.find(option => option.value === statusFilter)?.label || "所有状态"}
                </span>
              </Button>
            </DropdownTrigger>
            <DropdownMenu 
              aria-label="状态过滤"
              onAction={(key) => onStatusFilterChange(key as string)}
              selectedKeys={[statusFilter]}
              selectionMode="single"
            >
              {statusOptions.map((status) => (
                <DropdownItem key={status.value} className="text-sm">
                  <Flex align="center" className="gap-2">
                    <Box>{status.label}</Box>
                  </Flex>
                </DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
        </div>

        {/* 第三行：标签和回收站 */}
        <div className="flex gap-2">
          {/* 标签管理按钮 */}
          <Button 
            variant="flat"
            color="secondary"
            startContent={<FontAwesomeIcon icon={faTag} />}
            onClick={onTagManagement}
            isDisabled={loading}
            className="flex-1"
          >
            标签管理
          </Button>
          
          {/* 回收站按钮 */}
          <Button 
            variant="flat"
            color="warning"
            startContent={<FontAwesomeIcon icon={faRecycle} />}
            onClick={() => router.push('/tunnels/recycle')}
            isDisabled={loading}
            className="flex-1"
          >
            回收站
          </Button>
        </div>

        {/* 第四行：刷新和创建 */}
        <div className="flex gap-2">
          {/* 刷新按钮 */}
          <Button 
            variant="flat"
            startContent={loading ? <Spinner size="sm" /> : <FontAwesomeIcon icon={faRotateRight} />}
            onClick={onRefresh}
            isDisabled={loading}
            className="flex-1"
          >
            刷新
          </Button>
          
          {/* 创建按钮组 */}
          <ButtonGroup className="flex-1">
            <Button 
              color="primary" 
              startContent={loading ? <Spinner size="sm" /> : <FontAwesomeIcon icon={faPlus} />}
              onClick={() => router.push("/tunnels/create")}
              isDisabled={loading}
              className="flex-1"
            >
              创建
            </Button>
            <Dropdown placement="bottom-end">
              <DropdownTrigger>
                <Button
                  isIconOnly
                  color="primary"
                  isDisabled={loading}
                >
                  <FontAwesomeIcon icon={faChevronDown} />
                </Button>
              </DropdownTrigger>
              <DropdownMenu 
                aria-label="创建选项"
                onAction={(key) => {
                  switch(key) {
                    case 'manual':
                      setManualCreateOpen(true);
                      break;
                    case 'normal':
                      setIsNormalOpen(true);
                      break;
                    case 'batch':
                      setIsBatchOpen(true);
                      break;
                    case 'template':
                      router.push('/templates');
                      break;
                  }
                }}
              >
                <DropdownItem key="normal" startContent={<FontAwesomeIcon icon={faBolt} fixedWidth />}>
                  快速创建
                </DropdownItem>
                <DropdownItem key="manual" startContent={<FontAwesomeIcon icon={faHammer} fixedWidth />}>
                  手搓创建
                </DropdownItem>
                <DropdownItem key="batch" startContent={<FontAwesomeIcon icon={faCopy} fixedWidth />}>
                  批量创建
                </DropdownItem>
                <DropdownItem key="template" startContent={<FontAwesomeIcon icon={faLayerGroup} fixedWidth />}>
                  场景创建
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </ButtonGroup>
        </div>
      </div>

      {/* 快速创建实例弹窗 */}
      <QuickCreateTunnelModal
        isOpen={isNormalOpen}
        onOpenChange={setIsNormalOpen}
        onSaved={onRefresh}
      />

      {/* 批量创建实例弹窗 */}
      <BatchCreateModal
        isOpen={isBatchOpen}
        onOpenChange={setIsBatchOpen}
        onSaved={onRefresh}
      />
      
      {/* 手搓创建模态框 */}
      <ManualCreateTunnelModal
        isOpen={manualCreateOpen}
        onOpenChange={setManualCreateOpen}
        onSaved={onRefresh}
      />
    </div>
  );
};
