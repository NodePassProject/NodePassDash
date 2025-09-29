"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Tooltip,
  Input,
  DatePicker,
  Checkbox,
  RadioGroup,
  Radio,
  Select,
  SelectItem,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTag,
  faSave,
  faQuestionCircle,
} from "@fortawesome/free-solid-svg-icons";
import { addToast } from "@heroui/toast";
import JSONInput from "react-json-editor-ajrm";
import locale from "react-json-editor-ajrm/locale/zh-cn";
import { parseDate } from "@internationalized/date";

import { buildApiUrl } from "@/lib/utils";

// 标签数据结构
interface TagData {
  startDate?: string;
  endDate?: string;
  amount?: string;
  bandwidth?: string;
  trafficVol?: string;
  networkRoute?: string;
  extra?: string;
  [key: string]: any;
}

// 金额模式类型
type AmountMode = "none" | "prefix" | "suffix" | "free";

// 货币选项
const CURRENCY_OPTIONS = [
  { key: "CNY", label: "¥", value: "CNY" },
  { key: "USD", label: "$", value: "USD" },
  { key: "EUR", label: "€", value: "EUR" },
  { key: "GBP", label: "£", value: "GBP" },
  { key: "JPY", label: "¥", value: "JPY" },
];

// 带宽单位选项
const BANDWIDTH_UNITS = [
  { key: "Kbps", label: "Kbps" },
  { key: "Mbps", label: "Mbps" },
  { key: "Gbps", label: "Gbps" },
];

// 流量单位选项
const TRAFFIC_UNITS = [
  { key: "MB/月", label: "MB/月" },
  { key: "GB/月", label: "GB/月" },
  { key: "TB/月", label: "TB/月" },
  { key: "PB/月", label: "PB/月" },
];

interface InstanceTagModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  tunnelId: string;
  currentTags?: Record<string, string>; // 只支持map格式
  onSaved: () => void;
}

export default function InstanceTagModal({
  isOpen,
  onOpenChange,
  tunnelId,
  currentTags = {},
  onSaved,
}: InstanceTagModalProps) {
  const [jsonText, setJsonText] = useState("");
  const [saving, setSaving] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  // 用于存储JSON编辑器的实时内容（统一数据源）
  const currentJsonDataRef = useRef<TagData>({});

  // 删除了原始数据备份逻辑和 formData，只使用JSON数据

  // 表单显示状态（从 JSON 数据中解析）
  const [isUnlimited, setIsUnlimited] = useState(false);
  const [amountMode, setAmountMode] = useState<AmountMode>("none");
  const [prefixCurrency, setPrefixCurrency] = useState("CNY");
  const [suffixCurrency, setSuffixCurrency] = useState("CNY");
  const [amountValue, setAmountValue] = useState("");
  const [bandwidthValue, setBandwidthValue] = useState("");
  const [bandwidthUnit, setBandwidthUnit] = useState("Mbps");
  const [trafficValue, setTrafficValue] = useState("");
  const [trafficUnit, setTrafficUnit] = useState("GB/月");

  // 同步模式：'form' | 'json'
  const [syncMode, setSyncMode] = useState<"form" | "json">("form");

  // 获取当前 JSON 数据
  const getCurrentData = (): TagData => currentJsonDataRef.current || {};

  // 注释：删除了旧的数组格式转换函数，现在只支持map格式

  // 从表单状态更新JSON中的复合字段
  const updateJsonFromFormStates = () => {
    const data: TagData = { ...getCurrentData() };
    const currentData = getCurrentData();

    // 只更新复合字段（endDate和amount），其他字段由直接更新处理
    if (currentData.hasOwnProperty('endDate')) {
      if (isUnlimited) {
        data.endDate = "0000-00-00T23:59:59+08:00";
      } else if (!currentData.endDate || currentData.endDate === "0000-00-00T23:59:59+08:00") {
        delete data.endDate;
      }
      // 其他情况保持现有值
    }

    if (currentData.hasOwnProperty('amount')) {
      if (amountMode === "free") {
        data.amount = "Free";
      } else if (amountMode === "prefix" && amountValue) {
        const symbol =
          CURRENCY_OPTIONS.find((c) => c.key === prefixCurrency)?.label || "¥";
        data.amount = `${symbol}${amountValue}`;
      } else if (amountMode === "suffix" && amountValue) {
        data.amount = `${amountValue}${suffixCurrency}`;
      } else if (amountMode === "none" && amountValue) {
        data.amount = amountValue;
      } else {
        delete data.amount;
      }
    }

    if (currentData.hasOwnProperty('bandwidth')) {
      if (bandwidthValue) {
        data.bandwidth = `${bandwidthValue}${bandwidthUnit}`;
      } else {
        delete data.bandwidth;
      }
    }

    if (currentData.hasOwnProperty('trafficVol')) {
      if (trafficValue) {
        data.trafficVol = `${trafficValue}${trafficUnit}`;
      } else {
        delete data.trafficVol;
      }
    }

    // 非标准字段保持不变，不受表单影响

    return data;
  };

  // 从 JSON 数据初始化表单显示状态
  const initFormFromJsonData = (data: TagData, skipSyncMode = false) => {
    // 只在需要时设置同步模式
    if (!skipSyncMode) {
      setSyncMode("json");
    }
    // 不再设置 formData，直接从 JSON 数据解析表单状态

    // 初始化结束日期
    if (data.endDate === "0000-00-00T23:59:59+08:00") {
      setIsUnlimited(true);
    } else {
      setIsUnlimited(false);
    }

    // 初始化金额模式
    if (data.amount === "Free") {
      setAmountMode("free");
      setAmountValue("");
    } else if (data.amount) {
      const amount = data.amount;
      // 检查是否以货币符号开头
      const prefixMatch = CURRENCY_OPTIONS.find((c) =>
        amount.startsWith(c.label),
      );

      if (prefixMatch) {
        setAmountMode("prefix");
        setPrefixCurrency(prefixMatch.key);
        setAmountValue(amount.substring(prefixMatch.label.length));
      } else {
        // 检查是否以货币代码结尾
        const suffixMatch = CURRENCY_OPTIONS.find((c) =>
          amount.endsWith(c.key),
        );

        if (suffixMatch) {
          setAmountMode("suffix");
          setSuffixCurrency(suffixMatch.key);
          setAmountValue(
            amount.substring(0, amount.length - suffixMatch.key.length),
          );
        } else {
          setAmountMode("none");
          setAmountValue(amount);
        }
      }
    } else {
      setAmountMode("none");
      setAmountValue("");
    }

    // 初始化带宽
    if (data.bandwidth) {
      const bandwidthMatch = BANDWIDTH_UNITS.find((unit) =>
        data.bandwidth!.endsWith(unit.key),
      );

      if (bandwidthMatch) {
        setBandwidthValue(
          data.bandwidth.substring(
            0,
            data.bandwidth.length - bandwidthMatch.key.length,
          ),
        );
        setBandwidthUnit(bandwidthMatch.key);
      } else {
        setBandwidthValue(data.bandwidth);
      }
    } else {
      setBandwidthValue("");
    }

    // 初始化流量
    if (data.trafficVol) {
      const trafficMatch = TRAFFIC_UNITS.find((unit) =>
        data.trafficVol!.endsWith(unit.key),
      );

      if (trafficMatch) {
        setTrafficValue(
          data.trafficVol.substring(
            0,
            data.trafficVol.length - trafficMatch.key.length,
          ),
        );
        setTrafficUnit(trafficMatch.key);
      } else {
        setTrafficValue(data.trafficVol);
      }
    } else {
      setTrafficValue("");
    }
  };

  // 初始化标签数据
  useEffect(() => {
    if (isOpen) {
      // 直接使用map格式数据
      const initialData: TagData = currentTags || {};
      const initialJson = JSON.stringify(initialData, null, 2);

      // 初始化ref和状态
      currentJsonDataRef.current = initialData;
      initFormFromJsonData(initialData);
      setJsonText(initialJson);
      setJsonError(null);
      setSyncMode("form");

      console.log("Initialized with data:", initialData); // 调试日志
    }
  }, [isOpen, currentTags]);

  // 直接更新单个字段到JSON
  const updateJsonField = (field: string, value: any) => {
    const data = { ...getCurrentData() };

    if (value !== null && value !== undefined && value !== "") {
      data[field] = value;
    } else {
      delete data[field];
    }

    const jsonString = JSON.stringify(data, null, 2);
    setJsonText(jsonString);
    currentJsonDataRef.current = data;
    setJsonError(null);

    console.log(`Updated field ${field}:`, value, "-> New data:", data);
  };

  // JSON文本变化处理
  const handleJsonChange = (content: any) => {
    console.log("JSON Editor changed:", content); // 调试日志

    // react-json-editor-ajrm 返回的是对象，包含 jsObject 和其他信息
    if (content.error) {
      setJsonError(content.error.reason || "JSON 格式错误");
      currentJsonDataRef.current = {};
      return;
    }

    setJsonError(null);

    // 确保空值也能被正确处理
    const jsonObject = content.jsObject || {};
    const value = JSON.stringify(jsonObject, null, 2);

    // 更新状态和ref
    setJsonText(value);
    currentJsonDataRef.current = jsonObject;
    setSyncMode("json");

    console.log("Parsed JSON object:", jsonObject); // 调试日志
    console.log("Updated currentJsonDataRef:", currentJsonDataRef.current); // 调试日志

    // 实时验证JSON格式并同步到表单
    try {
      const parsed = jsonObject;

      // 允许空对象
      if (parsed === null || parsed === undefined) {
        initFormFromJsonData({}, true); // 跳过syncMode设置，避免冲突
        return;
      }

      // 只支持对象格式
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        // 对象格式验证和同步到表单
        initFormFromJsonData(parsed, true); // 跳过syncMode设置，避免冲突
      } else {
        setJsonError("数据必须是JSON对象格式");
        return;
      }
    } catch (error) {
      console.error("JSON processing error:", error); // 调试日志
      setJsonError("JSON 格式无效");
    }
  };

  // 表单字段变化时直接更新JSON
  useEffect(() => {
    if (syncMode !== "json") {
      console.log("Form changed, updating JSON. SyncMode:", syncMode); // 调试日志
      // 直接更新JSON中的复合字段
      const data = updateJsonFromFormStates();
      const jsonString = JSON.stringify(data, null, 2);
      setJsonText(jsonString);
      currentJsonDataRef.current = data;
      setJsonError(null);
    }
  }, [
    isUnlimited,
    amountMode,
    prefixCurrency,
    suffixCurrency,
    amountValue,
    bandwidthValue,
    bandwidthUnit,
    trafficValue,
    trafficUnit,
    syncMode,
  ]);

  // 确保 JSON 变化后重置同步模式
  useEffect(() => {
    if (syncMode === "json") {
      // 稍后重置为 form 模式，允许表单继续同步
      const timer = setTimeout(() => {
        console.log("Resetting sync mode to form"); // 调试日志
        setSyncMode("form");
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [syncMode]);

  // 保存标签设置
  const handleSave = async () => {
    try {
      setSaving(true);

      // 检查是否有JSON错误
      if (jsonError) {
        addToast({
          title: "错误",
          description: jsonError,
          color: "danger",
        });

        return;
      }

      // 优先使用ref中的实时数据，如果没有则使用jsonText
      let data: any = {};

      try {
        // 优先使用currentJsonDataRef中的数据
        if (currentJsonDataRef.current && Object.keys(currentJsonDataRef.current).length > 0) {
          data = currentJsonDataRef.current;
          console.log("Using ref data:", data); // 调试日志
        } else if (jsonText.trim() === "") {
          data = {};
          console.log("Using empty data"); // 调试日志
        } else {
          data = JSON.parse(jsonText);
          console.log("Using parsed jsonText:", data); // 调试日志
        }
      } catch (error) {
        addToast({
          title: "错误",
          description: "JSON 格式无效",
          color: "danger",
        });

        return;
      }

      // 直接发送map格式的JSON数据
      console.log("Final tags to submit:", data); // 调试日志

      const response = await fetch(
        buildApiUrl(`/api/tunnels/${tunnelId}/tags`),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      );

      if (!response.ok) {
        const error = await response.json();

        throw new Error(error.message || "设置实例标签失败");
      }

      addToast({
        title: "成功",
        description: "实例标签设置成功",
        color: "success",
      });

      onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error("设置实例标签失败:", error);
      addToast({
        title: "错误",
        description:
          error instanceof Error ? error.message : "设置实例标签失败",
        color: "danger",
      });
    } finally {
      setSaving(false);
    }
  };


  return (
    <Modal isOpen={isOpen} size="3xl" onOpenChange={onOpenChange}>
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon className="text-primary" icon={faTag} />
                实例标签设置
                <Tooltip
                  content={
                    <div className="p-2 max-w-xs">
                      <p className="font-medium mb-2">使用说明：</p>
                      <ul className="text-xs space-y-1">
                        <li>• 左侧为标准字段输入，右侧为 JSON 格式</li>
                        <li>• 左右两侧实时同步，可随意编辑</li>
                        <li>• 空对象 {} 表示清除所有标签</li>
                        <li>• 支持自定义字段扩展</li>
                      </ul>
                    </div>
                  }
                  placement="bottom"
                >
                  <FontAwesomeIcon
                    className="text-default-400 cursor-help text-sm"
                    icon={faQuestionCircle}
                  />
                </Tooltip>
              </div>
            </ModalHeader>
            <ModalBody className="max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-6 h-full">
                {/* 左侧：标准字段输入 */}
                <div className="space-y-4">
                  {/* 开始日期 */}
                  <div>
                    <label className="text-sm font-medium text-default-600 mb-2 block">
                      开始日期
                    </label>
                    <DatePicker
                      className="w-full"
                      value={
                        getCurrentData().startDate
                          ? parseDate(
                              getCurrentData().startDate.split("T")[0],
                            ) as any
                          : null
                      }
                      onChange={(date) => {
                        if (date) {
                          updateJsonField('startDate', `${date.toString()}T12:58:17.636Z`);
                        } else {
                          updateJsonField('startDate', null);
                        }
                      }}
                    />
                  </div>

                  {/* 结束日期 */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-default-600">
                        结束日期
                      </label>
                      <Checkbox
                        isSelected={isUnlimited}
                        size="sm"
                        onValueChange={setIsUnlimited}
                      >
                        无限期
                      </Checkbox>
                    </div>
                    <DatePicker
                      className="w-full"
                      isDisabled={isUnlimited}
                      minValue={
                        getCurrentData().startDate
                          ? parseDate(
                              getCurrentData().startDate.split("T")[0],
                            ) as any
                          : undefined
                      }
                      value={
                        !isUnlimited &&
                        getCurrentData().endDate &&
                        getCurrentData().endDate !== "0000-00-00T23:59:59+08:00"
                          ? parseDate(
                              getCurrentData().endDate.split("T")[0],
                            ) as any
                          : null
                      }
                      onChange={(date) => {
                        if (date) {
                          updateJsonField('endDate', `${date.toString()}T12:58:17.636Z`);
                        } else {
                          updateJsonField('endDate', null);
                        }
                      }}
                    />
                  </div>

                  {/* 金额 */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-default-600">
                        金额
                      </label>
                      <RadioGroup
                        orientation="horizontal"
                        size="sm"
                        value={amountMode}
                        onValueChange={(value) =>
                          setAmountMode(value as AmountMode)
                        }
                      >
                        <Radio value="none">无格式</Radio>
                        <Radio value="prefix">前缀</Radio>
                        <Radio value="suffix">后缀</Radio>
                        <Radio value="free">免费</Radio>
                      </RadioGroup>
                    </div>

                    <div className="flex gap-2">
                      {amountMode === "prefix" && (
                        <Select
                          className="w-20"
                          selectedKeys={[prefixCurrency]}
                          size="sm"
                          onSelectionChange={(keys) =>
                            setPrefixCurrency(Array.from(keys)[0] as string)
                          }
                        >
                          {CURRENCY_OPTIONS.map((currency) => (
                            <SelectItem key={currency.key}>
                              {currency.label}
                            </SelectItem>
                          ))}
                        </Select>
                      )}

                      <Input
                        className="flex-1"
                        isDisabled={amountMode === "free"}
                        placeholder={
                          amountMode === "free" ? "免费" : "输入金额"
                        }
                        size="sm"
                        value={amountValue}
                        onValueChange={setAmountValue}
                      />

                      {amountMode === "suffix" && (
                        <Select
                          className="w-20"
                          selectedKeys={[suffixCurrency]}
                          size="sm"
                          onSelectionChange={(keys) =>
                            setSuffixCurrency(Array.from(keys)[0] as string)
                          }
                        >
                          {CURRENCY_OPTIONS.map((currency) => (
                            <SelectItem key={currency.key}>
                              {currency.key}
                            </SelectItem>
                          ))}
                        </Select>
                      )}
                    </div>
                  </div>

                  {/* 带宽 */}
                  <div>
                    <label className="text-sm font-medium text-default-600 mb-2 block">
                      带宽
                    </label>
                    <Input
                      endContent={
                        <select
                          className="border-0 bg-transparent text-default-600 text-sm outline-none"
                          value={bandwidthUnit}
                          onChange={(e) => setBandwidthUnit(e.target.value)}
                        >
                          {BANDWIDTH_UNITS.map((unit) => (
                            <option key={unit.key} value={unit.key}>
                              {unit.label}
                            </option>
                          ))}
                        </select>
                      }
                      placeholder="输入带宽"
                      size="sm"
                      value={bandwidthValue}
                      onValueChange={setBandwidthValue}
                    />
                  </div>

                  {/* 流量 */}
                  <div>
                    <label className="text-sm font-medium text-default-600 mb-2 block">
                      流量
                    </label>
                    <Input
                      endContent={
                        <select
                          className="border-0 bg-transparent text-default-600 text-sm outline-none"
                          value={trafficUnit}
                          onChange={(e) => setTrafficUnit(e.target.value)}
                        >
                          {TRAFFIC_UNITS.map((unit) => (
                            <option key={unit.key} value={unit.key}>
                              {unit.label}
                            </option>
                          ))}
                        </select>
                      }
                      placeholder="输入流量"
                      size="sm"
                      value={trafficValue}
                      onValueChange={setTrafficValue}
                    />
                  </div>


                  {/* 额外信息 */}
                  <div>
                    <label className="text-sm font-medium text-default-600 mb-2 block">
                      额外信息
                    </label>
                    <Input
                      placeholder="输入额外信息，使用逗号分隔"
                      size="sm"
                      value={getCurrentData().extra || ""}
                      onValueChange={(value) => {
                        updateJsonField('extra', value || null);
                      }}
                    />
                  </div>
                </div>

                {/* 右侧：JSON 编辑器 */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="border border-default-200 rounded-lg overflow-hidden">
                      <JSONInput
                        key={`json-editor-${isOpen}`}
                        allowEmpty={true}
                        colors={{
                          default: "#D4D4D4",
                          background: "#1E1E1E",
                          background_warning: "#1E1E1E",
                          string: "#CE9178",
                          number: "#B5CEA8",
                          colon: "#D4D4D4",
                          keys: "#9CDCFE",
                          keys_whiteSpace: "#D4D4D4",
                          primitive: "#569CD6",
                        }}
                        confirmGood={false}
                        height="370px"
                        id="json-editor"
                        locale={locale}
                        modifyErrorText={() => ""}
                        placeholder={(() => {
                          try {
                            return JSON.parse(jsonText);
                          } catch {
                            return {};
                          }
                        })()}
                        reset={false}
                        style={{
                          body: {
                            fontSize: "13px",
                            fontFamily:
                              'Monaco, Menlo, "Ubuntu Mono", monospace',
                          },
                        }}
                        theme="dark_vscode_tribute"
                        viewOnly={false}
                        width="100%"
                        onChange={handleJsonChange}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </ModalBody>
            <ModalFooter className="flex items-center pt-2 justify-between">
              <div className="flex gap-2">
                {jsonError && (
                  <p className="text-danger text-sm">{jsonError}</p>
                )}

                {/* JSON验证提示 */}
                {jsonText && (
                  <div className="text-xs">
                    {(() => {
                      try {
                        if (jsonText.trim() === "") {
                          return (
                            <div className="text-default-500 flex items-center gap-1">
                              <span>•</span>
                              <span>空对象将清除所有标签</span>
                            </div>
                          );
                        }

                        const data = JSON.parse(jsonText.trim());

                        if (typeof data === "object" && data !== null && !Array.isArray(data)) {
                          // 对象格式
                          const fieldCount = Object.keys(data).length;

                          if (fieldCount > 0) {
                            return (
                              <div className="text-success-600 flex items-center gap-1">
                                <span>✓</span>
                                <span>
                                  检测到 {fieldCount} 个字段
                                </span>
                              </div>
                            );
                          } else {
                            return (
                              <div className="text-warning-600 flex items-center gap-1">
                                <span>!</span>
                                <span>空对象，将清除所有标签</span>
                              </div>
                            );
                          }
                        } else {
                          return (
                            <div className="text-danger-600 flex items-center gap-1">
                              <span>✗</span>
                              <span>必须是JSON对象格式</span>
                            </div>
                          );
                        }
                      } catch {
                        return (
                          <div className="text-danger-600 flex items-center gap-1">
                            <span>✗</span>
                            <span>JSON 格式错误</span>
                          </div>
                        );
                      }
                    })()}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  color="default"
                  isDisabled={saving}
                  variant="flat"
                  onPress={onClose}
                >
                  取消
                </Button>
                <Button
                  color="primary"
                  isDisabled={!!jsonError}
                  isLoading={saving}
                  startContent={<FontAwesomeIcon icon={faSave} />}
                  onPress={handleSave}
                >
                  保存
                </Button>
              </div>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
