import React, { useState, useEffect } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Textarea,
  DatePicker,
  Checkbox,
  Select,
  SelectItem,
  RadioGroup,
  Radio,
  Divider,
} from "@heroui/react";
import { parseDate } from "@internationalized/date";
import { addToast } from "@heroui/toast";

interface InstanceTagModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  tunnelId: string;
  currentTags?: { [key: string]: string };
  onSaved?: () => void;
}

// 币种选项
const CURRENCY_OPTIONS = [
  { key: "CNY", label: "¥", symbol: "¥" },
  { key: "USD", label: "$", symbol: "$" },
  { key: "EUR", label: "€", symbol: "€" },
  { key: "GBP", label: "£", symbol: "£" },
  { key: "JPY", label: "¥", symbol: "¥" },
];

// 币种代码
const CURRENCY_CODES = [
  { key: "CNY", label: "CNY" },
  { key: "USD", label: "USD" },
  { key: "EUR", label: "EUR" },
  { key: "GBP", label: "GBP" },
  { key: "JPY", label: "JPY" },
];

// 带宽单位
const BANDWIDTH_UNITS = [
  { key: "Kbps", label: "Kbps" },
  { key: "Mbps", label: "Mbps" },
  { key: "Gbps", label: "Gbps" },
];

// 流量单位
const TRAFFIC_UNITS = [
  { key: "MB", label: "MB" },
  { key: "GB", label: "GB" },
  { key: "TB", label: "TB" },
  { key: "MB/Month", label: "MB/Month" },
  { key: "GB/Month", label: "GB/Month" },
  { key: "TB/Month", label: "TB/Month" },
];

const InstanceTagModal: React.FC<InstanceTagModalProps> = ({
  isOpen,
  onOpenChange,
  tunnelId,
  currentTags = {},
  onSaved,
}) => {
  // 标准字段状态
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [isUnlimited, setIsUnlimited] = useState(false);

  // 金额相关状态
  const [amountValue, setAmountValue] = useState<string>("");
  const [amountType, setAmountType] = useState<string>("none"); // none, prefix, suffix, free
  const [prefixCurrency, setPrefixCurrency] = useState<string>("CNY");
  const [suffixCurrency, setSuffixCurrency] = useState<string>("CNY");

  // 带宽和流量
  const [bandwidthValue, setBandwidthValue] = useState<string>("");
  const [bandwidthUnit, setBandwidthUnit] = useState<string>("Mbps");
  const [trafficValue, setTrafficValue] = useState<string>("");
  const [trafficUnit, setTrafficUnit] = useState<string>("GB/Month");

  // 其他字段
  const [networkRoute, setNetworkRoute] = useState<string>("");
  const [extra, setExtra] = useState<string>("");

  // JSON 编辑器状态
  const [jsonValue, setJsonValue] = useState<string>("");
  const [isJsonError, setIsJsonError] = useState(false);

  // 扩展字段存储（用于保留非标准字段）
  const [extendedFields, setExtendedFields] = useState<{ [key: string]: string }>({});

  // 是否正在保存
  const [isSaving, setIsSaving] = useState(false);

  // 标准字段列表（用于区分标准字段和扩展字段）
  const STANDARD_FIELDS = [
    'startDate', 'endDate', 'amount', 'bandwidth',
    'trafficVol', 'networkRoute', 'extra'
  ];

  // 从当前tags初始化状态
  useEffect(() => {
    if (currentTags && Object.keys(currentTags).length > 0) {
      initializeFromTags(currentTags);
    } else {
      resetToDefaults();
    }
  }, [currentTags, isOpen]);

  // 初始化表单数据
  const initializeFromTags = (tags: { [key: string]: string }) => {
    setStartDate(tags.startDate || "");

    // 处理结束日期和无限期
    if (tags.endDate === "0000-00-00T23:59:59+08:00") {
      setIsUnlimited(true);
      setEndDate("");
    } else {
      setIsUnlimited(false);
      setEndDate(tags.endDate || "");
    }

    // 处理金额
    parseAmount(tags.amount || "");

    // 处理带宽
    parseBandwidth(tags.bandwidth || "");

    // 处理流量
    parseTraffic(tags.trafficVol || "");

    setNetworkRoute(tags.networkRoute || "");
    setExtra(tags.extra || "");

    // 提取扩展字段（非标准字段）
    const extended: { [key: string]: string } = {};
    Object.keys(tags).forEach(key => {
      if (!STANDARD_FIELDS.includes(key)) {
        extended[key] = tags[key];
      }
    });
    setExtendedFields(extended);

    // 更新JSON显示
    updateJsonFromFields(tags);
  };

  // 重置为默认值
  const resetToDefaults = () => {
    setStartDate("");
    setEndDate("");
    setIsUnlimited(false);
    setAmountValue("");
    setAmountType("none");
    setBandwidthValue("");
    setTrafficValue("");
    setNetworkRoute("");
    setExtra("");
    setExtendedFields({});
    setJsonValue("{}");
  };

  // 解析金额字段
  const parseAmount = (amount: string) => {
    if (!amount) {
      setAmountType("none");
      setAmountValue("");
      return;
    }

    // 检查是否为免费
    if (amount.toLowerCase().includes("免费") || amount.toLowerCase().includes("free")) {
      setAmountType("free");
      setAmountValue("");
      return;
    }

    // 检查前缀货币符号
    const prefixMatch = amount.match(/^([¥$€£])(.+)/);
    if (prefixMatch) {
      setAmountType("prefix");
      const symbol = prefixMatch[1];
      const currency = CURRENCY_OPTIONS.find(c => c.symbol === symbol);
      if (currency) {
        setPrefixCurrency(currency.key);
      }
      setAmountValue(prefixMatch[2]);
      return;
    }

    // 检查后缀货币代码
    const suffixMatch = amount.match(/^(.+?)(CNY|USD|EUR|GBP|JPY)$/);
    if (suffixMatch) {
      setAmountType("suffix");
      setAmountValue(suffixMatch[1]);
      setSuffixCurrency(suffixMatch[2]);
      return;
    }

    // 默认为普通输入
    setAmountType("none");
    setAmountValue(amount);
  };

  // 解析带宽
  const parseBandwidth = (bandwidth: string) => {
    if (!bandwidth) return;

    const match = bandwidth.match(/^(.+?)(Kbps|Mbps|Gbps)$/);
    if (match) {
      setBandwidthValue(match[1]);
      setBandwidthUnit(match[2]);
    } else {
      setBandwidthValue(bandwidth);
    }
  };

  // 解析流量
  const parseTraffic = (traffic: string) => {
    if (!traffic) return;

    const match = traffic.match(/^(.+?)(MB|GB|TB|MB\/Month|GB\/Month|TB\/Month)$/);
    if (match) {
      setTrafficValue(match[1]);
      setTrafficUnit(match[2]);
    } else {
      setTrafficValue(traffic);
    }
  };

  // 从字段更新JSON（保留扩展字段）
  const updateJsonFromFields = (additionalTags: { [key: string]: string } = {}) => {
    const tags: { [key: string]: string } = { ...extendedFields }; // 先添加扩展字段

    // 添加标准字段
    if (startDate) tags.startDate = startDate;

    if (isUnlimited) {
      tags.endDate = "0000-00-00T23:59:59+08:00";
    } else if (endDate) {
      tags.endDate = endDate;
    }

    // 处理金额
    if (amountType === "free") {
      tags.amount = "free";
    } else if (amountType === "prefix" && amountValue) {
      const currency = CURRENCY_OPTIONS.find(c => c.key === prefixCurrency);
      tags.amount = `${currency?.symbol}${amountValue}`;
    } else if (amountType === "suffix" && amountValue) {
      tags.amount = `${amountValue}${suffixCurrency}`;
    } else if (amountType === "none" && amountValue) {
      tags.amount = amountValue;
    }

    if (bandwidthValue) {
      tags.bandwidth = `${bandwidthValue}${bandwidthUnit}`;
    }

    if (trafficValue) {
      tags.trafficVol = `${trafficValue}${trafficUnit}`;
    }

    if (networkRoute) tags.networkRoute = networkRoute;
    if (extra) tags.extra = extra;

    // 如果有 additionalTags（初始化时），合并它们但不覆盖已经处理的标准字段
    Object.keys(additionalTags).forEach(key => {
      if (!STANDARD_FIELDS.includes(key)) {
        tags[key] = additionalTags[key];
      }
    });

    setJsonValue(JSON.stringify(tags, null, 2));
    setIsJsonError(false);
  };

  // 当字段变化时更新JSON
  useEffect(() => {
    updateJsonFromFields();
  }, [
    startDate,
    endDate,
    isUnlimited,
    amountValue,
    amountType,
    prefixCurrency,
    suffixCurrency,
    bandwidthValue,
    bandwidthUnit,
    trafficValue,
    trafficUnit,
    networkRoute,
    extra,
    extendedFields,
  ]);

  // 从JSON更新字段（支持扩展字段）
  const updateFieldsFromJson = (jsonString: string) => {
    try {
      const tags = JSON.parse(jsonString);
      if (typeof tags === 'object' && tags !== null) {
        // 分离标准字段和扩展字段
        const standardTags: { [key: string]: string } = {};
        const extendedTags: { [key: string]: string } = {};

        Object.keys(tags).forEach(key => {
          if (STANDARD_FIELDS.includes(key)) {
            standardTags[key] = tags[key];
          } else {
            extendedTags[key] = tags[key];
          }
        });

        // 更新扩展字段
        setExtendedFields(extendedTags);

        // 更新标准字段（不调用 initializeFromTags，避免循环）
        setStartDate(standardTags.startDate || "");

        // 处理结束日期和无限期
        if (standardTags.endDate === "0000-00-00T23:59:59+08:00") {
          setIsUnlimited(true);
          setEndDate("");
        } else {
          setIsUnlimited(false);
          setEndDate(standardTags.endDate || "");
        }

        // 处理金额
        parseAmount(standardTags.amount || "");

        // 处理带宽
        parseBandwidth(standardTags.bandwidth || "");

        // 处理流量
        parseTraffic(standardTags.trafficVol || "");

        setNetworkRoute(standardTags.networkRoute || "");
        setExtra(standardTags.extra || "");

        setIsJsonError(false);
      }
    } catch (error) {
      setIsJsonError(true);
    }
  };

  // 处理JSON输入变化
  const handleJsonChange = (value: string) => {
    setJsonValue(value);
    updateFieldsFromJson(value);
  };

  // 保存标签
  const handleSave = async () => {
    try {
      const tags = JSON.parse(jsonValue);
      setIsSaving(true);

      const response = await fetch(`/api/tunnels/${tunnelId}/tags`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(tags),
      });

      if (!response.ok) {
        throw new Error("保存标签失败");
      }

      addToast({
        title: "保存成功",
        description: "实例标签已更新",
        color: "success",
      });

      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      console.error("保存标签失败:", error);
      addToast({
        title: "保存失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="5xl"
      scrollBehavior="inside"
      className="max-h-[90vh]"
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">编辑实例标签</h2>
            </ModalHeader>
            <ModalBody>
              <div className="flex gap-6 h-full">
                {/* 左侧：标准字段表单 */}
                <div className="flex-1 space-y-2">
                  {/* 日期字段 */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4">
                      {/* 开始日期 */}
                      <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-default-700">开始日期</label>
                        <DatePicker
                          value={startDate ? parseDate(startDate.split('T')[0]) : undefined}
                          onChange={(date) => {
                            if (date) {
                              // 格式化为 YYYY-MM-DD 然后拼接时区时间
                              const year = date.year;
                              const month = String(date.month).padStart(2, '0');
                              const day = String(date.day).padStart(2, '0');
                              setStartDate(`${year}-${month}-${day}T00:00:00+08:00`);
                            } else {
                              setStartDate('');
                            }
                          }}
                          showMonthAndYearPickers
                          variant="bordered"
                          granularity="day"
                        />
                      </div>

                      {/* 结束日期 */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium text-default-700">结束日期</label>
                          <Checkbox
                            isSelected={isUnlimited}
                            onValueChange={(checked) => {
                              setIsUnlimited(checked);
                              if (checked) {
                                setEndDate(''); // 清空日期，会在updateJsonFromFields中设置为特殊值
                              }
                            }}
                            size="sm"
                          >
                            无限期
                          </Checkbox>
                        </div>
                        <DatePicker
                          value={!isUnlimited && endDate ? parseDate(endDate.split('T')[0]) : undefined}
                          onChange={(date) => {
                            if (date) {
                              // 格式化为 YYYY-MM-DD 然后拼接时区时间
                              const year = date.year;
                              const month = String(date.month).padStart(2, '0');
                              const day = String(date.day).padStart(2, '0');
                              setEndDate(`${year}-${month}-${day}T23:59:59+08:00`);
                            } else {
                              setEndDate('');
                            }
                          }}
                          showMonthAndYearPickers
                          variant="bordered"
                          isDisabled={isUnlimited}
                          minValue={startDate ? parseDate(startDate.split('T')[0]) : undefined}
                          granularity="day"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 金额字段 */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-default-700">金额</label>
                      <RadioGroup
                        value={amountType}
                        onValueChange={setAmountType}
                        orientation="horizontal"
                        className="gap-2"
                        size="sm"
                      >
                        <Radio value="none">无格式</Radio>
                        <Radio value="prefix">前缀</Radio>
                        <Radio value="suffix">后缀</Radio>
                        <Radio value="free">免费</Radio>
                      </RadioGroup>
                    </div>

                    {/* 金额输入区域 */}
                    {amountType === "none" && (
                      <Input
                        placeholder="输入金额"
                        value={amountValue}
                        onValueChange={setAmountValue}
                        variant="bordered"
                      />
                    )}

                    {amountType === "prefix" && (
                      <div className="flex gap-2">
                        <Select
                          selectedKeys={[prefixCurrency]}
                          onSelectionChange={(keys) => {
                            const selected = Array.from(keys)[0] as string;
                            setPrefixCurrency(selected);
                          }}
                          className="w-32"
                          variant="bordered"
                          aria-label="货币符号"
                        >
                          {CURRENCY_OPTIONS.map((currency) => (
                            <SelectItem key={currency.key}>
                              {currency.symbol}
                            </SelectItem>
                          ))}
                        </Select>
                        <Input
                          placeholder="输入金额"
                          value={amountValue}
                          onValueChange={setAmountValue}
                          variant="bordered"
                          className="flex-1"
                          startContent={
                            <span className="text-default-500">
                              {CURRENCY_OPTIONS.find(c => c.key === prefixCurrency)?.symbol}
                            </span>
                          }
                        />
                      </div>
                    )}

                    {amountType === "suffix" && (
                      <div className="flex gap-2">
                        <Input
                          placeholder="输入金额"
                          value={amountValue}
                          onValueChange={setAmountValue}
                          variant="bordered"
                          className="flex-1"
                          endContent={
                            <span className="text-default-500">
                              {suffixCurrency}
                            </span>
                          }
                        />
                        <Select
                          selectedKeys={[suffixCurrency]}
                          onSelectionChange={(keys) => {
                            const selected = Array.from(keys)[0] as string;
                            setSuffixCurrency(selected);
                          }}
                          className="w-32"
                          variant="bordered"
                          aria-label="货币代码"
                        >
                          {CURRENCY_CODES.map((currency) => (
                            <SelectItem key={currency.key}>
                              {currency.label}
                            </SelectItem>
                          ))}
                        </Select>
                      </div>
                    )}

                    {amountType === "free" && (
                      <Input
                        placeholder="free"
                        value="free"
                        variant="bordered"
                        isDisabled
                      />
                    )}
                  </div>

                  {/* 带宽和流量字段 */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4">
                      {/* 带宽 */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-default-700">带宽</label>
                        <Input
                          placeholder="输入带宽数值"
                          value={bandwidthValue}
                          onValueChange={setBandwidthValue}
                          variant="bordered"
                          endContent={
                            <select
                              value={bandwidthUnit}
                              onChange={(e) => setBandwidthUnit(e.target.value)}
                              className="outline-none border-none bg-transparent text-default-500 text-sm"
                            >
                              {BANDWIDTH_UNITS.map((unit) => (
                                <option key={unit.key} value={unit.key}>
                                  {unit.label}
                                </option>
                              ))}
                            </select>
                          }
                        />
                      </div>

                      {/* 流量 */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-default-700">流量</label>
                        <Input
                          placeholder="输入流量数值"
                          value={trafficValue}
                          onValueChange={setTrafficValue}
                          variant="bordered"
                          endContent={
                            <select
                              value={trafficUnit}
                              onChange={(e) => setTrafficUnit(e.target.value)}
                              className="outline-none border-none bg-transparent text-default-500 text-sm"
                            >
                              {TRAFFIC_UNITS.map((unit) => (
                                <option key={unit.key} value={unit.key}>
                                  {unit.label}
                                </option>
                              ))}
                            </select>
                          }
                        />
                      </div>
                    </div>
                  </div>

                  {/* 其他信息字段 */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4">
                      {/* 网络路由 */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-default-700">网络路由</label>
                        <Input
                          placeholder="例如：4837、9929、联通 等"
                          value={networkRoute}
                          onValueChange={setNetworkRoute}
                          variant="bordered"
                        />
                      </div>

                      {/* 额外信息 */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-default-700">额外信息</label>
                        <Input
                          placeholder="使用逗号分隔多个信息"
                          value={extra}
                          onValueChange={setExtra}
                          variant="bordered"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <Divider orientation="vertical" />

                {/* 右侧：JSON编辑器 */}
                <div className="flex-1 space-y-4">
                  <Textarea
                    value={jsonValue}
                    onValueChange={handleJsonChange}
                    minRows={20}
                    maxRows={25}
                    variant="bordered"
                    className="font-mono text-sm"
                    color={isJsonError ? "danger" : "default"}
                  />
                </div>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button color="danger" variant="light" onPress={onClose}>
                取消
              </Button>
              <Button
                color="primary"
                onPress={handleSave}
                isLoading={isSaving}
                isDisabled={isJsonError}
              >
                保存
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default InstanceTagModal;