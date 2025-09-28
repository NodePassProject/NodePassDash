"use client";

import React, { useState, useEffect } from "react";
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
import { parseDate, type DateValue } from "@internationalized/date";

import { buildApiUrl } from "@/lib/utils";

// 实例标签类型
interface InstanceTag {
  key: string;
  value: string;
}

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
  currentTags?: InstanceTag[];
  onSaved: () => void;
}

export default function InstanceTagModal({
  isOpen,
  onOpenChange,
  tunnelId,
  currentTags = [],
  onSaved,
}: InstanceTagModalProps) {
  const [jsonText, setJsonText] = useState("");
  const [saving, setSaving] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  // 原始数据备份，用于对比变化
  const [originalData, setOriginalData] = useState<TagData>({});

  // 标准字段状态
  const [formData, setFormData] = useState<TagData>({});
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

  // 数据转换函数：InstanceTag[] -> TagData
  const convertTagsToData = (tags: InstanceTag[]): TagData => {
    const data: TagData = {};

    tags.forEach((tag) => {
      data[tag.key] = tag.value;
    });

    return data;
  };

  // 数据转换函数：TagData -> InstanceTag[]
  const convertDataToTags = (data: TagData): InstanceTag[] => {
    return Object.entries(data).map(([key, value]) => ({
      key,
      value: String(value),
    }));
  };

  // 从表单数据生成完整的TagData
  const buildTagDataFromForm = (): TagData => {
    const data: TagData = {};

    if (formData.startDate) data.startDate = formData.startDate;

    if (isUnlimited) {
      data.endDate = "0000-00-00T23:59:59+08:00";
    } else if (formData.endDate) {
      data.endDate = formData.endDate;
    }

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
    }

    if (bandwidthValue) {
      data.bandwidth = `${bandwidthValue}${bandwidthUnit}`;
    }

    if (trafficValue) {
      data.trafficVol = `${trafficValue}${trafficUnit}`;
    }

    if (formData.networkRoute) data.networkRoute = formData.networkRoute;
    if (formData.extra) data.extra = formData.extra;

    // 添加其他非标准字段
    Object.keys(formData).forEach((key) => {
      if (
        ![
          "startDate",
          "endDate",
          "amount",
          "bandwidth",
          "trafficVol",
          "networkRoute",
          "extra",
        ].includes(key)
      ) {
        data[key] = formData[key];
      }
    });

    return data;
  };

  // 构建用于提交的标签数据（处理删除逻辑）
  const buildSubmitTags = (currentData: TagData): InstanceTag[] => {
    const tags: InstanceTag[] = [];

    console.log("buildSubmitTags - originalData:", originalData); // 调试日志
    console.log("buildSubmitTags - currentData:", currentData); // 调试日志

    // 获取所有可能的字段（原始数据 + 当前数据）
    const allKeys = new Set([
      ...Object.keys(originalData),
      ...Object.keys(currentData),
    ]);

    console.log("buildSubmitTags - allKeys:", Array.from(allKeys)); // 调试日志

    allKeys.forEach((key) => {
      const originalValue = originalData[key];
      const currentValue = currentData[key];

      console.log(
        `buildSubmitTags - Key: ${key}, Original: "${originalValue}", Current: "${currentValue}"`,
      ); // 调试日志

      // 如果原始数据有这个字段，则需要处理
      if (originalValue !== undefined) {
        if (
          currentValue === "" ||
          currentValue === undefined ||
          currentValue === null
        ) {
          // 字段被删除或清空，发送空值以删除
          console.log(
            `buildSubmitTags - Field ${key} was cleared, adding empty value for deletion`,
          ); // 调试日志
          tags.push({ key, value: "" });
        } else {
          // 字段有值（包括修改和未变化）
          console.log(
            `buildSubmitTags - Field ${key} has value, adding: "${String(currentValue)}"`,
          ); // 调试日志
          tags.push({ key, value: String(currentValue) });
        }
      } else if (
        currentValue !== undefined &&
        currentValue !== null &&
        currentValue !== ""
      ) {
        // 新增的字段（不包括空值）
        console.log(
          `buildSubmitTags - New field ${key} added with value: "${String(currentValue)}"`,
        ); // 调试日志
        tags.push({ key, value: String(currentValue) });
      }
    });

    console.log("buildSubmitTags - Final tags:", tags); // 调试日志

    return tags;
  };

  // 从 JSON 对象构建标签数组（包含空值）
  const buildTagsFromJsonObject = (data: TagData): InstanceTag[] => {
    const tags: InstanceTag[] = [];

    console.log("Building tags from JSON object:", data); // 调试日志

    // 遍历所有字段，包括空值
    Object.entries(data).forEach(([key, value]) => {
      // 确保空值也能被正确处理
      const stringValue =
        value === null || value === undefined ? "" : String(value);

      tags.push({ key, value: stringValue });
      console.log(`Added tag: ${key} = "${stringValue}"`); // 调试日志
    });

    console.log("Final tags array:", tags); // 调试日志

    return tags;
  };

  // 从 TagData 初始化表单状态
  const initFormFromData = (data: TagData) => {
    setFormData(data);

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
      // 兼容原有的数组格式数据
      let initialData: TagData = {};
      let initialJson: string;

      if (currentTags && currentTags.length > 0) {
        // 检查是否有标准字段，如果有则优先显示对象格式
        const standardFields = [
          "startDate",
          "endDate",
          "amount",
          "bandwidth",
          "trafficVol",
          "networkRoute",
          "extra",
        ];
        const hasStandardFields = currentTags.some((tag) =>
          standardFields.includes(tag.key),
        );

        if (hasStandardFields) {
          // 新格式：转换为对象显示
          initialData = convertTagsToData(currentTags);
          initialJson = JSON.stringify(initialData, null, 2);
        } else {
          // 旧格式：显示数组格式，但也同步到表单
          initialData = convertTagsToData(currentTags);
          initialJson = JSON.stringify(currentTags, null, 2);
        }
      } else {
        initialJson = JSON.stringify(initialData, null, 2);
      }

      // 设置原始数据备份
      setOriginalData({ ...initialData });
      initFormFromData(initialData);
      setJsonText(initialJson);
      setJsonError(null);
      setSyncMode("form");
    }
  }, [isOpen, currentTags]);

  // 同步表单数据到JSON
  const syncFormToJson = () => {
    if (syncMode === "json") return; // 防止循环同步

    setSyncMode("form");
    const data = buildTagDataFromForm();

    setJsonText(JSON.stringify(data, null, 2));
    setJsonError(null);
  };

  // JSON文本变化处理
  const handleJsonChange = (content: any) => {
    console.log("JSON Editor changed:", content); // 调试日志

    // react-json-editor-ajrm 返回的是对象，包含 jsObject 和其他信息
    if (content.error) {
      setJsonError(content.error.reason || "JSON 格式错误");

      return;
    }

    setJsonError(null);

    // 确保空值也能被正确处理
    const jsonObject = content.jsObject || {};
    const value = JSON.stringify(jsonObject, null, 2);

    setJsonText(value);
    setSyncMode("json");

    console.log("Parsed JSON object:", jsonObject); // 调试日志
    console.log("Original data for comparison:", originalData); // 调试日志

    // 实时验证JSON格式
    try {
      const parsed = jsonObject;

      // 允许空对象
      if (parsed === null || parsed === undefined) {
        if (syncMode === "json") {
          initFormFromData({});
        }

        return;
      }

      // 支持两种格式：数组格式（旧）和对象格式（新）
      if (Array.isArray(parsed)) {
        // 数组格式验证（放宽验证，允许空值）
        for (let i = 0; i < parsed.length; i++) {
          const tag = parsed[i];

          if (!tag || typeof tag !== "object" || tag.key === undefined) {
            setJsonError(`第 ${i + 1} 个标签格式不正确，必须包含 key 字段`);

            return;
          }
        }
        // 数组格式转换为对象同步到表单
        if (syncMode === "json") {
          const convertedData = convertTagsToData(parsed);

          initFormFromData(convertedData);
        }

        return;
      } else if (typeof parsed === "object" && parsed !== null) {
        // 对象格式验证和同步（允许空值）
        if (syncMode === "json") {
          initFormFromData(parsed);
        }
      } else {
        setJsonError("数据必须是对象或数组格式");

        return;
      }
    } catch (error) {
      console.error("JSON processing error:", error); // 调试日志
      setJsonError("JSON 格式无效");
    }
  };

  // 表单字段变化时同步到JSON
  useEffect(() => {
    if (syncMode === "form") {
      syncFormToJson();
    }
  }, [
    formData,
    isUnlimited,
    amountMode,
    prefixCurrency,
    suffixCurrency,
    amountValue,
    bandwidthValue,
    bandwidthUnit,
    trafficValue,
    trafficUnit,
  ]);

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

      // 解析JSON
      let data: any = {};

      try {
        if (jsonText.trim() === "") {
          data = {};
        } else {
          data = JSON.parse(jsonText);
        }
      } catch (error) {
        addToast({
          title: "错误",
          description: "JSON 格式无效",
          color: "danger",
        });

        return;
      }

      // 根据JSON格式决定如何处理数据
      let tags: InstanceTag[] = [];

      console.log("Save function - data:", data); // 调试日志
      console.log("Save function - jsonText:", jsonText); // 调试日志
      console.log("Save function - syncMode:", syncMode); // 调试日志
      console.log("Save function - originalData:", originalData); // 调试日志

      if (Array.isArray(data)) {
        // 数组格式直接使用
        console.log("Using array format data directly");
        tags = data;
      } else {
        // 对象格式：根据 syncMode 决定处理方式
        if (syncMode === "json") {
          // 来自 JSON 编辑器的更改，使用对比逻辑处理删除
          console.log("Using buildSubmitTags for JSON editor changes");
          tags = buildSubmitTags(data);
        } else {
          // 来自表单的更改，也使用对比逻辑
          console.log("Using buildSubmitTags for form changes");
          tags = buildSubmitTags(data);
        }
      }

      console.log("Final tags to submit:", tags); // 调试日志

      const response = await fetch(
        buildApiUrl(`/api/tunnels/${tunnelId}/instance-tags`),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tags: tags,
          }),
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

  // 检查是否有变化
  const hasChanges = () => {
    try {
      const currentData = JSON.parse(jsonText);

      // 对比当前数据和原始数据
      if (Array.isArray(currentData)) {
        // 数组格式的比较
        const originalTags = convertDataToTags(originalData);

        return JSON.stringify(currentData) !== JSON.stringify(originalTags);
      } else {
        // 对象格式的比较
        return JSON.stringify(currentData) !== JSON.stringify(originalData);
      }
    } catch {
      // JSON解析失败时，认为有变化
      return true;
    }
  };

  return (
    <Modal isOpen={isOpen} size="5xl" onOpenChange={onOpenChange}>
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
                  {/* 开始日期和结束日期 */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-default-600 mb-2 block">
                        开始日期
                      </label>
                      <DatePicker
                        className="w-full"
                        value={
                          formData.startDate
                            ? (parseDate(
                                formData.startDate.split("T")[0],
                              ) as DateValue)
                            : null
                        }
                        onChange={(date) => {
                          const newData = { ...formData };

                          if (date) {
                            newData.startDate = `${date.toString()}T12:58:17.636Z`;
                          } else {
                            delete newData.startDate;
                          }
                          setFormData(newData);
                        }}
                      />
                    </div>
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
                          formData.startDate
                            ? (parseDate(
                                formData.startDate.split("T")[0],
                              ) as DateValue)
                            : undefined
                        }
                        value={
                          !isUnlimited &&
                          formData.endDate &&
                          formData.endDate !== "0000-00-00T23:59:59+08:00"
                            ? (parseDate(
                                formData.endDate.split("T")[0],
                              ) as DateValue)
                            : null
                        }
                        onChange={(date) => {
                          const newData = { ...formData };

                          if (date) {
                            newData.endDate = `${date.toString()}T12:58:17.636Z`;
                          } else {
                            delete newData.endDate;
                          }
                          setFormData(newData);
                        }}
                      />
                    </div>
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

                  {/* 带宽和流量 */}
                  <div className="grid grid-cols-2 gap-4">
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
                  </div>

                  {/* 网络路由 */}
                  <div>
                    <label className="text-sm font-medium text-default-600 mb-2 block">
                      网络路由
                    </label>
                    <Input
                      placeholder="输入网络路由"
                      size="sm"
                      value={formData.networkRoute || ""}
                      onValueChange={(value) => {
                        const newData = { ...formData };

                        if (value) {
                          newData.networkRoute = value;
                        } else {
                          delete newData.networkRoute;
                        }
                        setFormData(newData);
                      }}
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
                      value={formData.extra || ""}
                      onValueChange={(value) => {
                        const newData = { ...formData };

                        if (value) {
                          newData.extra = value;
                        } else {
                          delete newData.extra;
                        }
                        setFormData(newData);
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
                        height="420px"
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
            <ModalFooter className="flex items-center pt-0 justify-between">
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

                        if (Array.isArray(data)) {
                          // 数组格式
                          const validCount = data.filter(
                            (tag: any) =>
                              tag &&
                              typeof tag === "object" &&
                              tag.key &&
                              tag.value,
                          ).length;

                          if (validCount === data.length && data.length > 0) {
                            return (
                              <div className="text-success-600 flex items-center gap-1">
                                <span>✓</span>
                                <span>
                                  检测到 {validCount} 个标签（数组格式）
                                </span>
                              </div>
                            );
                          } else if (data.length === 0) {
                            return (
                              <div className="text-warning-600 flex items-center gap-1">
                                <span>!</span>
                                <span>空数组，将清除所有标签</span>
                              </div>
                            );
                          } else {
                            return (
                              <div className="text-warning-600 flex items-center gap-1">
                                <span>⚠</span>
                                <span>
                                  有效标签：{validCount} / {data.length}
                                </span>
                              </div>
                            );
                          }
                        } else if (typeof data === "object" && data !== null) {
                          // 对象格式
                          const fieldCount = Object.keys(data).length;

                          if (fieldCount > 0) {
                            return (
                              <div className="text-success-600 flex items-center gap-1">
                                <span>✓</span>
                                <span>
                                  检测到 {fieldCount} 个字段（对象格式）
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
                              <span>必须是 JSON 对象或数组格式</span>
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
                  isDisabled={!hasChanges() || !!jsonError}
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
