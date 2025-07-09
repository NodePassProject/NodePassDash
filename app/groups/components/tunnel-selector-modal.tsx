"use client";

import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Checkbox,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  Pagination,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch, faServer, faDesktop } from "@fortawesome/free-solid-svg-icons";
import React, { useMemo, useState } from 'react';
import { Flex, Box } from "@/components";

interface Tunnel {
  id: string;
  name: string;
  type: string;
  tunnelAddress: string;
  tunnelPort: string;
  targetAddress: string;
  targetPort: string;
  status: {
    type: "success" | "danger" | "warning";
    text: string;
  };
  endpoint: string;
}

interface TunnelSelectorModalProps {
  isOpen: boolean;
  onOpenChange: () => void;
  tunnels: Tunnel[];
  selectedTunnelIds: string[];
  onSelectionChange: (tunnelIds: string[]) => void;
  onConfirm: () => void;
  title?: string;
}

export const TunnelSelectorModal: React.FC<TunnelSelectorModalProps> = ({
  isOpen,
  onOpenChange,
  tunnels,
  selectedTunnelIds,
  onSelectionChange,
  onConfirm,
  title = "选择隧道"
}) => {
  const [filterValue, setFilterValue] = useState("");
  const [page, setPage] = useState(1);
  const rowsPerPage = 10;

  // 过滤隧道
  const filteredTunnels = useMemo(() => {
    return tunnels.filter(tunnel => 
      tunnel.name.toLowerCase().includes(filterValue.toLowerCase()) ||
      tunnel.endpoint.toLowerCase().includes(filterValue.toLowerCase())
    );
  }, [tunnels, filterValue]);

  // 分页处理
  const pages = Math.ceil(filteredTunnels.length / rowsPerPage);
  const items = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    return filteredTunnels.slice(start, end);
  }, [page, filteredTunnels]);

  // 处理单个隧道选择
  const handleTunnelToggle = (tunnelId: string) => {
    const isSelected = selectedTunnelIds.includes(tunnelId);
    if (isSelected) {
      onSelectionChange(selectedTunnelIds.filter(id => id !== tunnelId));
    } else {
      onSelectionChange([...selectedTunnelIds, tunnelId]);
    }
  };

  // 处理全选/取消全选
  const handleSelectAll = (isSelected: boolean) => {
    if (isSelected) {
      const allIds = filteredTunnels.map(tunnel => tunnel.id);
      const newSelected = [...new Set([...selectedTunnelIds, ...allIds])];
      onSelectionChange(newSelected);
    } else {
      const filteredIds = filteredTunnels.map(tunnel => tunnel.id);
      onSelectionChange(selectedTunnelIds.filter(id => !filteredIds.includes(id)));
    }
  };

  // 获取隧道类型颜色
  const getTunnelTypeColor = (type: string) => {
    return type === '服务端' ? 'primary' : 'secondary';
  };

  // 获取状态颜色
  const getStatusColor = (status: { type: string }) => {
    switch (status.type) {
      case 'success': return 'success';
      case 'danger': return 'danger';
      case 'warning': return 'warning';
      default: return 'default';
    }
  };

  const isAllSelected = filteredTunnels.length > 0 && 
    filteredTunnels.every(tunnel => selectedTunnelIds.includes(tunnel.id));
  const isIndeterminate = filteredTunnels.some(tunnel => selectedTunnelIds.includes(tunnel.id)) && 
    !isAllSelected;

  return (
    <Modal 
      isOpen={isOpen} 
      onOpenChange={onOpenChange}
      size="5xl"
      scrollBehavior="inside"
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <h3 className="text-lg">{title}</h3>
              <p className="text-sm text-default-500">
                选择要添加到分组的隧道实例
              </p>
            </ModalHeader>
            <ModalBody>
              <Box className="space-y-4">
                {/* 搜索栏 */}
                <Input
                  isClearable
                  placeholder="搜索隧道名称或主控..."
                  startContent={<FontAwesomeIcon icon={faSearch} />}
                  value={filterValue}
                  onValueChange={setFilterValue}
                  onClear={() => setFilterValue("")}
                />

                {/* 统计信息 */}
                <Flex className="items-center justify-between">
                  <div className="text-sm text-default-500">
                    共 {filteredTunnels.length} 个隧道，已选择 {selectedTunnelIds.length} 个
                  </div>
                  <Checkbox
                    isSelected={isAllSelected}
                    isIndeterminate={isIndeterminate}
                    onValueChange={handleSelectAll}
                  >
                    全选当前页
                  </Checkbox>
                </Flex>

                {/* 隧道列表 */}
                <Table
                  aria-label="隧道选择表格"
                  bottomContent={
                    pages > 1 ? (
                      <div className="flex w-full justify-center">
                        <Pagination
                          isCompact
                          showControls
                          showShadow
                          color="primary"
                          page={page}
                          total={pages}
                          onChange={setPage}
                        />
                      </div>
                    ) : null
                  }
                >
                  <TableHeader>
                    <TableColumn>选择</TableColumn>
                    <TableColumn>隧道名称</TableColumn>
                    <TableColumn>类型</TableColumn>
                    <TableColumn>隧道地址</TableColumn>
                    <TableColumn>目标地址</TableColumn>
                    <TableColumn>状态</TableColumn>
                    <TableColumn>主控</TableColumn>
                  </TableHeader>
                  <TableBody>
                    {items.map((tunnel) => (
                      <TableRow key={tunnel.id}>
                        <TableCell>
                          <Checkbox
                            isSelected={selectedTunnelIds.includes(tunnel.id)}
                            onValueChange={() => handleTunnelToggle(tunnel.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <Flex className="items-center gap-2">
                            <FontAwesomeIcon 
                              icon={tunnel.type === '服务端' ? faServer : faDesktop} 
                              className="text-default-400"
                            />
                            <span className="font-medium">{tunnel.name}</span>
                          </Flex>
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="sm"
                            variant="flat"
                            color={getTunnelTypeColor(tunnel.type)}
                          >
                            {tunnel.type}
                          </Chip>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs">
                            {tunnel.tunnelAddress}:{tunnel.tunnelPort}
                          </code>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs">
                            {tunnel.targetAddress}:{tunnel.targetPort}
                          </code>
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="sm"
                            variant="flat"
                            color={getStatusColor(tunnel.status)}
                          >
                            {tunnel.status.text}
                          </Chip>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-default-500">
                            {tunnel.endpoint}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {filteredTunnels.length === 0 && (
                  <div className="text-center py-8 text-default-500">
                    {filterValue ? '没有找到匹配的隧道' : '暂无隧道数据'}
                  </div>
                )}
              </Box>
            </ModalBody>
            <ModalFooter>
              <Button variant="flat" onPress={onClose}>
                取消
              </Button>
              <Button 
                color="primary" 
                onPress={() => {
                  onConfirm();
                  onClose();
                }}
              >
                确认选择 ({selectedTunnelIds.length})
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}; 