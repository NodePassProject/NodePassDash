"use client";

import { Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Spinner, Button, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/react";
import { addToast } from "@heroui/toast";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { buildApiUrl } from "@/lib/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faTrash, faRotateLeft, faChevronDown, faChevronUp, faEye } from "@fortawesome/free-solid-svg-icons";
import { motion, AnimatePresence } from "framer-motion";

interface RecycleItem {
  id: number;
  name: string;
  mode: string;
  tunnelAddress: string;
  tunnelPort: string;
  targetAddress: string;
  targetPort: string;
  tlsMode: string;
  certPath?: string | null;
  keyPath?: string | null;
  logLevel: string;
  commandLine: string;
  instanceId?: string | null;
  tcpRx: number;
  tcpTx: number;
  udpRx: number;
  udpTx: number;
  min?: number | null;
  max?: number | null;
}

export default function RecyclePage(){
  const router = useRouter();
  const searchParams = useSearchParams();
  const endpointId = searchParams.get("id");
  const [items,setItems]=useState<RecycleItem[]>([]);
  const [loading,setLoading]=useState(true);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{id: number, name: string} | null>(null);

  const fetchData = useCallback(async()=>{
    if(!endpointId) return;
    try{
      setLoading(true);
      const res = await fetch(buildApiUrl(`/api/endpoints/${endpointId}/recycle`));
      const data = await res.json();
      setItems(data||[]);
    }catch(e){console.error(e);}finally{setLoading(false);}
  },[endpointId]);
  useEffect(()=>{fetchData();},[fetchData]);

  const columns = [
    {key:"expand",label:""},
    {key:"id",label:"ID"},
    {key:"name",label:"名称"},
    {key:"mode",label:"模式"},
    {key:"tunnel",label:"隧道"},
    {key:"target",label:"目标"},
    {key:"actions",label:""}
  ];

  const [expanded,setExpanded] = useState<Set<number>>(new Set());

  const toggleExpand=(id:number)=>{
    setExpanded(prev=>{
      const s=new Set(prev);
      if(s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const openDeleteModal = (item: RecycleItem) => {
    setItemToDelete({id: item.id, name: item.name});
    setDeleteModalOpen(true);
  };

  const handleDelete = async ()=>{
    if(!endpointId || !itemToDelete) return;
    try{
      const res = await fetch(buildApiUrl(`/api/endpoints/${endpointId}/recycle/${itemToDelete.id}`),{method:"DELETE"});
      const data = await res.json();
      if(!res.ok || data.error){
        throw new Error(data.error||"删除失败");
      }
      addToast({title:"删除成功",description:"记录已清空",color:"success"});
      fetchData();
      setDeleteModalOpen(false);
      setItemToDelete(null);
    }catch(e){
      console.error(e);
      addToast({title:"删除失败",description: e instanceof Error? e.message: "未知错误",color:"danger"});
    }
  };

  /**
   * 将 Go sql.NullXXX 编码后的对象转换为可显示值
   */
  const formatVal = (value: any): string | number => {
    if (value === null || value === undefined) return "-";
    if (typeof value === "object") {
      if ("String" in value) {
        return value.Valid ? (value as any).String || "-" : "-";
      }
      if ("Int64" in value) {
        return value.Valid ? (value as any).Int64 ?? "-" : "-";
      }
    }
    return value as any;
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <Button isIconOnly variant="flat" size="sm" onClick={() => router.back()} className="bg-default-100 hover:bg-default-200 dark:bg-default-100/10 dark:hover:bg-default-100/20">
            <FontAwesomeIcon icon={faArrowLeft} />
          </Button>
          <h1 className="text-lg md:text-2xl font-bold truncate">回收站</h1>
        </div>
      </div>
      <Table aria-label="回收站列表" >
        <TableHeader columns={columns}>{col=><TableColumn key={col.key}>{col.label}</TableColumn>}</TableHeader>
        <TableBody
          isLoading={loading}
          loadingContent={<Spinner />}
          emptyContent="回收站暂无数据"
        >
          <>
          {items.flatMap((item) => {
            const mainRow = (
              <TableRow key={item.id}>
                {columns.map((col) => {
                  if (col.key === "expand") {
                    return (
                      <TableCell key="expand" className="w-4">
                        <Button
                          isIconOnly
                          variant="light"
                          size="sm"
                          onClick={() => toggleExpand(item.id)}
                        >
                          <FontAwesomeIcon
                            icon={expanded.has(item.id) ? faChevronUp : faChevronDown}
                            className="text-xs"
                          />
                        </Button>
                      </TableCell>
                    );
                  }
                  if (col.key === "actions") {
                    return (
                      <TableCell key="actions">
                        <div className="flex gap-1">
                          <Button
                            isIconOnly
                            size="sm"
                            color="danger"
                            variant="light"
                            onPress={() => openDeleteModal(item)}
                          >
                            <FontAwesomeIcon icon={faTrash} className="text-xs" />
                          </Button>
                          <Button isIconOnly size="sm" variant="flat" isDisabled>
                            <FontAwesomeIcon icon={faRotateLeft} className="text-xs" />
                          </Button>
                          <Button isIconOnly size="sm" variant="light" isDisabled>
                            <FontAwesomeIcon icon={faEye} className="text-xs" />
                          </Button>
                        </div>
                      </TableCell>
                    );
                  }
                  let val: any;
                  switch (col.key) {
                    case "tunnel":
                      val = `${item.tunnelAddress}:${item.tunnelPort}`;
                      break;
                    case "target":
                      val = `${item.targetAddress}:${item.targetPort}`;
                      break;
                    default:
                      val = (item as any)[col.key];
                  }
                  return (
                    <TableCell
                      key={col.key}
                      className="truncate max-w-[300px]"
                      title={String(formatVal(val))}
                    >
                      {formatVal(val)}
                    </TableCell>
                  );
                })}
              </TableRow>
            );

            const detailsRow = expanded.has(item.id) ? (
              <TableRow key={`details-${item.id}`} className="p-0">
                <TableCell colSpan={columns.length} className="p-0">
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="p-4 bg-default-100/50 dark:bg-default-100/10"
                  >
                    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 text-sm">
                      <div>
                        <span className="font-medium mr-1">TLS 模式:</span>
                        {formatVal(item.tlsMode)}
                      </div>
                      <div>
                        <span className="font-medium mr-1">证书路径:</span>
                        {formatVal(item.certPath)}
                      </div>
                      <div>
                        <span className="font-medium mr-1">密钥路径:</span>
                        {formatVal(item.keyPath)}
                      </div>
                      <div>
                        <span className="font-medium mr-1">日志级别:</span>
                        {formatVal(item.logLevel)}
                      </div>
                      <div className="col-span-2 md:col-span-3 break-all">
                        <span className="font-medium mr-1">命令行:</span>
                        {formatVal(item.commandLine)}
                      </div>
                      <div>
                        <span className="font-medium mr-1">实例 ID:</span>
                        {formatVal(item.instanceId)}
                      </div>
                      <div>
                        <span className="font-medium mr-1">TCP ⬇:</span>
                        {formatVal(item.tcpRx)}
                      </div>
                      <div>
                        <span className="font-medium mr-1">TCP ⬆:</span>
                        {formatVal(item.tcpTx)}
                      </div>
                      <div>
                        <span className="font-medium mr-1">UDP ⬇:</span>
                        {formatVal(item.udpRx)}
                      </div>
                      <div>
                        <span className="font-medium mr-1">UDP ⬆:</span>
                        {formatVal(item.udpTx)}
                      </div>
                      <div>
                        <span className="font-medium mr-1">最小连接:</span>
                        {formatVal(item.min)}
                      </div>
                      <div>
                        <span className="font-medium mr-1">最大连接:</span>
                        {formatVal(item.max)}
                      </div>
                    </div>
                  </motion.div>
                </TableCell>
              </TableRow>
            ) : null;

            return [mainRow, ...(detailsRow ? [detailsRow] : [])];
          })}
          </>
        </TableBody>
      </Table>

      {/* 删除确认模态框 */}
      <Modal 
        isOpen={deleteModalOpen} 
        onClose={() => {
          setDeleteModalOpen(false);
          setItemToDelete(null);
        }}
        size="sm"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            确认删除
          </ModalHeader>
          <ModalBody>
            <p>确定要永久删除隧道 <span className="font-semibold text-danger">"{itemToDelete?.name}"</span> 吗？</p>
            <p className="text-sm text-default-500">此操作不可撤销，该记录将被永久清空。</p>
          </ModalBody>
          <ModalFooter>
            <Button 
              variant="light" 
              onPress={() => {
                setDeleteModalOpen(false);
                setItemToDelete(null);
              }}
            >
              取消
            </Button>
            <Button 
              color="danger" 
              onPress={handleDelete}
            >
              确认删除
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
} 