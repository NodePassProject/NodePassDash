import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner,
  Select,
  SelectItem
} from "@heroui/react";
import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBolt } from "@fortawesome/free-solid-svg-icons";
import { addToast } from "@heroui/toast";
import { buildApiUrl } from "@/lib/utils";

interface EndpointSimple {
  id: string;
  name: string;
}

interface QuickCreateTunnelModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  mode?: 'create' | 'edit';
  editData?: Partial<Record<string, any>> & { id?: string };
}

/**
 * 快速创建实例模态框（简易表单）
 */
export default function QuickCreateTunnelModal({ isOpen, onOpenChange, onSaved, mode: modalMode = 'create', editData }: QuickCreateTunnelModalProps) {
  const [endpoints, setEndpoints] = useState<EndpointSimple[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // 表单数据
  const [formData, setFormData] = useState({
    apiEndpoint: "",
    mode: "server", // server | client
    tunnelName: "",
    tunnelAddress: "",
    tunnelPort: "",
    targetAddress: "",
    targetPort: "",
    tlsMode: "inherit", // inherit | mode0 | mode1 | mode2
    logLevel: "inherit", // inherit, debug, info, warn, error
    min: "",
    max: "",
    certPath: "",
    keyPath: ""
  });

  // 当打开时加载端点，并在 edit 时填充表单
  useEffect(() => {
    if (!isOpen) return;
    const fetchEndpoints = async () => {
      try {
        setLoading(true);
        const res = await fetch(buildApiUrl("/api/endpoints/simple?excludeFailed=true"));
        const data = await res.json();
        setEndpoints(data);
        if (data.length) {
          let defaultEp = String(data[0].id);
          if(editData && editData.endpointId){
            const epFound = data.find((e:EndpointSimple)=> String(e.id)===String(editData.endpointId));
            if(epFound) defaultEp = String(epFound.id);
          }
          setFormData(prev=>({...prev, apiEndpoint: defaultEp }));
        }
      } catch (err) {
        addToast({ title: "获取主控失败", description: "无法获取主控列表", color: "danger" });
      } finally {
        setLoading(false);
      }
    };
    fetchEndpoints();

    // 填充编辑数据
    if(modalMode==='edit' && editData){
      setFormData(prev=>({
        ...prev,
        mode: editData.mode || prev.mode,
        tunnelName: editData.name || '',
        tunnelAddress: editData.tunnelAddress || '',
        tunnelPort: String(editData.tunnelPort||''),
        targetAddress: editData.targetAddress || '',
        targetPort: String(editData.targetPort||''),
        tlsMode: editData.tlsMode || prev.tlsMode,
        logLevel: editData.logLevel || prev.logLevel,
        min: editData.min!==undefined? String(editData.min):'',
        max: editData.max!==undefined? String(editData.max):'',
        certPath: editData.certPath || '',
        keyPath: editData.keyPath || '',
        apiEndpoint: String(editData.endpointId || prev.apiEndpoint)
      }));
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    const {
      apiEndpoint, mode, tunnelName, tunnelAddress, tunnelPort,
      targetAddress, targetPort, tlsMode, logLevel, min, max,
      certPath, keyPath
    } = formData;

    // 基本校验
    if (!apiEndpoint || !tunnelName.trim() || !tunnelPort || !targetPort) {
      addToast({ title: "请填写必填字段", description: "主控/名称/端口不能为空", color: "warning" });
      return;
    }

    const tp = parseInt(tunnelPort); const tp2 = parseInt(targetPort);
    if (tp<0||tp>65535||tp2<0||tp2>65535) {
      addToast({ title: "端口不合法", description:"端口需 0-65535", color:"warning"});
      return;
    }

    // server + mode2 校验证书路径
    if (mode === 'server' && tlsMode === 'mode2' && (!certPath.trim() || !keyPath.trim())) {
      addToast({title:'缺少证书', description:'TLS 模式2 需填写证书与密钥路径', color:'warning'});
      return;
    }

    try {
      setSubmitting(true);
      const url = modalMode==='edit' ? buildApiUrl(`/api/tunnels/${editData?.id}`) : buildApiUrl("/api/tunnels");
      console.log("url",url);
      const method = modalMode==='edit' ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpointId: Number(apiEndpoint),
          name: tunnelName.trim(),
          mode,
          tunnelAddress,
          tunnelPort,
          targetAddress,
          targetPort,
          tlsMode: mode === 'server' ? tlsMode : undefined,
          certPath: mode==='server' && tlsMode==='mode2' ? certPath.trim() : undefined,
          keyPath: mode==='server' && tlsMode==='mode2' ? keyPath.trim() : undefined,
          logLevel,
          min: mode==='client' && min ? min : undefined,
          max: mode==='client' && max ? max : undefined
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || (modalMode==='edit'? '更新失败':'创建失败'));
      addToast({ title: modalMode==='edit' ? '更新成功':'创建成功', description: data.message || '', color: "success" });
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      addToast({ title: modalMode==='edit'?'更新失败':"创建失败", description: err instanceof Error ? err.message : "未知错误", color: "danger" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleField = (field:string, value:string)=> setFormData(prev=>({...prev,[field]:value}));

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} placement="center" size="lg">
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex items-center gap-2">
              <FontAwesomeIcon icon={faBolt} className="text-warning" />
              {modalMode==='edit'? '编辑实例':'创建实例'}
            </ModalHeader>
            <ModalBody className="space-y-4">
              {loading ? (
                <div className="flex justify-center items-center py-6"><Spinner /></div>
              ) : (
                <>
                  {/* 主控 & 实例模式 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <Select
                      label="选择主控"
                      variant="bordered"
                      selectedKeys={[formData.apiEndpoint]}
                      onSelectionChange={(keys)=> handleField('apiEndpoint', Array.from(keys)[0] as string)}
                      isDisabled={modalMode==='edit'}
                    >
                      {endpoints.map((ep)=> (
                        <SelectItem key={ep.id}>{ep.name}</SelectItem>
                      ))}
                    </Select>
                    <Select
                      label="实例模式"
                      variant="bordered"
                      selectedKeys={[formData.mode]}
                      onSelectionChange={(keys)=> handleField('mode', Array.from(keys)[0] as string)}
                      isDisabled={modalMode==='edit'}
                    >
                      <SelectItem key="server">服务端</SelectItem>
                      <SelectItem key="client">客户端</SelectItem>
                    </Select>
                  </div>

                  {/* 实例名称 & 日志级别 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <Input
                      label="实例名称"
                      value={formData.tunnelName}
                      onValueChange={(v)=>handleField('tunnelName',v)}
                    />
                    <Select
                      label="日志级别"
                      variant="bordered"
                      selectedKeys={[formData.logLevel]}
                      onSelectionChange={(keys)=> handleField('logLevel', Array.from(keys)[0] as string)}
                    >
                      <SelectItem key="inherit">继承</SelectItem>
                      <SelectItem key="debug">Debug</SelectItem>
                      <SelectItem key="info">Info</SelectItem>
                      <SelectItem key="warn">Warn</SelectItem>
                      <SelectItem key="error">Error</SelectItem>
                    </Select>
                  </div>

                  {/* 隧道地址端口 */}
                  <div className="grid grid-cols-2 gap-2">
                    <Input label="隧道地址" value={formData.tunnelAddress} onValueChange={(v)=>handleField('tunnelAddress',v)} />
                    <Input label="隧道端口" type="number" value={formData.tunnelPort} onValueChange={(v)=>handleField('tunnelPort',v)} />
                  </div>

                  {/* 目标地址端口 */}
                  <div className="grid grid-cols-2 gap-2">
                    <Input label="目标地址" value={formData.targetAddress} onValueChange={(v)=>handleField('targetAddress',v)} />
                    <Input label="目标端口" type="number" value={formData.targetPort} onValueChange={(v)=>handleField('targetPort',v)} />
                  </div>

                  {/* TLS 下拉 - server */}
                  {formData.mode === 'server' && (
                    <Select
                      label="TLS 模式"
                      variant="bordered"
                      selectedKeys={[formData.tlsMode]}
                      onSelectionChange={(keys)=> handleField('tlsMode', Array.from(keys)[0] as string)}
                    >
                      <SelectItem key="inherit">继承主控</SelectItem>
                      <SelectItem key="mode0">模式0 无 TLS</SelectItem>
                      <SelectItem key="mode1">模式1 自签名</SelectItem>
                      <SelectItem key="mode2">模式2 自定义证书</SelectItem>
                    </Select>
                  )}

                  {/* 连接池容量 - client */}
                  {formData.mode === 'client' && (
                    <div className="grid grid-cols-2 gap-2">
                      <Input label="连接池最小容量" value={formData.min} onValueChange={(v)=>handleField('min',v)} />
                      <Input label="连接池最大容量" value={formData.max} onValueChange={(v)=>handleField('max',v)} />
                    </div>
                  )}

                  {/* 证书路径 - server & tls mode2 */}
                  {formData.mode==='server' && formData.tlsMode==='mode2' && (
                    <div className="grid grid-cols-2 gap-2">
                      <Input label="证书路径 (crt)" value={formData.certPath} onValueChange={(v)=>handleField('certPath',v)} />
                      <Input label="密钥路径 (key)" value={formData.keyPath} onValueChange={(v)=>handleField('keyPath',v)} />
                    </div>
                  )}
                </>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose}>取消</Button>
               <Button color="primary" isLoading={submitting} onPress={handleSubmit}>{modalMode==='edit'?'更新':'创建'}</Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
} 