"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Divider,
  Spinner,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlay,
  faStop,
  faNetworkWired,
} from "@fortawesome/free-solid-svg-icons";
import { addToast } from "@heroui/toast";

import { buildApiUrl } from "@/lib/utils";

interface NetworkDebugModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  endpointId: number;
}

interface TestResult {
  timestamp: number;
  success: boolean;
  latency?: number;
  error?: string;
}

interface TestStats {
  total: number;
  success: number;
  failed: number;
  avgLatency: number;
  maxLatency: number;
  minLatency: number;
  packetLoss: number;
}

// 简单的延迟图表组件
function LatencyChart({ results }: { results: TestResult[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    // 设置canvas尺寸
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const width = rect.width;
    const height = rect.height;
    const paddingTop = 30;
    const paddingBottom = 40; // 增加底部边距为X轴时间标签留出空间
    const paddingLeft = 50; // 增加左边距为Y轴标签留出空间
    const paddingRight = 20;

    // 清空画布
    ctx.clearRect(0, 0, width, height);

    // 获取成功的测试结果
    const successResults = results.filter(
      (r) => r.success && r.latency && r.latency > 0,
    );

    if (successResults.length < 2) return;

    // 计算数据范围
    const latencies = successResults.map((r) => r.latency as number);
    const minLatency = Math.min(...latencies);
    const maxLatency = Math.max(...latencies);
    const latencyRange = maxLatency - minLatency || 1;

    // 绘制网格线
    ctx.strokeStyle = "#e4e4e7";
    ctx.lineWidth = 1;

    // 水平网格线
    for (let i = 0; i <= 4; i++) {
      const y = paddingTop + ((height - paddingTop - paddingBottom) * i) / 4;

      ctx.beginPath();
      ctx.moveTo(paddingLeft, y);
      ctx.lineTo(width - paddingRight, y);
      ctx.stroke();
    }

    // 垂直网格线
    for (let i = 0; i <= 5; i++) {
      const x = paddingLeft + ((width - paddingLeft - paddingRight) * i) / 5;

      ctx.beginPath();
      ctx.moveTo(x, paddingTop);
      ctx.lineTo(x, height - paddingBottom);
      ctx.stroke();
    }

    // 绘制延迟曲线
    if (successResults.length > 1) {
      ctx.strokeStyle = "#006fee";
      ctx.lineWidth = 2;
      ctx.beginPath();

      successResults.forEach((result, index) => {
        const x =
          paddingLeft +
          ((width - paddingLeft - paddingRight) * index) /
            (successResults.length - 1);
        const y =
          height -
          paddingBottom -
          ((height - paddingTop - paddingBottom) *
            ((result.latency as number) - minLatency)) /
            latencyRange;

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();

      // 绘制数据点和数值标签
      ctx.fillStyle = "#006fee";
      successResults.forEach((result, index) => {
        const x =
          paddingLeft +
          ((width - paddingLeft - paddingRight) * index) /
            (successResults.length - 1);
        const y =
          height -
          paddingBottom -
          ((height - paddingTop - paddingBottom) *
            ((result.latency as number) - minLatency)) /
            latencyRange;

        // 绘制数据点
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.fill();

        // 绘制数值标签
        ctx.fillStyle = "#006fee";
        ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${result.latency as number}ms`, x, y - 8);
      });

      // 重置填充样式
      ctx.fillStyle = "#006fee";
    }

    // 绘制失败点
    const failedResults = results.filter((r) => !r.success);

    if (failedResults.length > 0) {
      ctx.fillStyle = "#f31260";
      failedResults.forEach((result) => {
        const resultIndex = results.indexOf(result);

        if (resultIndex >= 0 && results.length > 1) {
          const x =
            paddingLeft +
            ((width - paddingLeft - paddingRight) * resultIndex) /
              (results.length - 1);
          const y = height - paddingBottom;

          ctx.beginPath();
          ctx.arc(x, y - 5, 3, 0, 2 * Math.PI);
          ctx.fill();
        }
      });
    }

    // 绘制Y轴标签
    ctx.fillStyle = "#71717a";
    ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "right";

    // 计算合适的标签间隔，避免重复
    const range = maxLatency - minLatency;
    const steps = 4;
    let stepSize = range / steps;

    // 如果范围很小，使用小数点
    if (range < 10) {
      stepSize = Math.max(0.1, stepSize);
    } else {
      stepSize = Math.max(1, Math.ceil(stepSize));
    }

    for (let i = 0; i <= steps; i++) {
      const value =
        minLatency + ((maxLatency - minLatency) * (steps - i)) / steps;
      const y =
        paddingTop + ((height - paddingTop - paddingBottom) * i) / steps;

      // 根据值的大小决定显示格式
      let displayValue;

      if (range < 10) {
        displayValue = value.toFixed(1);
      } else {
        displayValue = Math.round(value).toString();
      }

      ctx.fillText(`${displayValue}ms`, paddingLeft - 10, y + 4);
    }

    // 绘制X轴标签（时间戳）
    if (results.length > 0) {
      ctx.fillStyle = "#71717a";
      ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";

      // 显示最多5个时间标签，避免过于拥挤
      const maxLabels = Math.min(5, results.length);
      const step = Math.max(1, Math.floor(results.length / maxLabels));

      for (let i = 0; i < results.length; i += step) {
        const result = results[i];
        const x =
          paddingLeft +
          ((width - paddingLeft - paddingRight) * i) / (results.length - 1);
        const y = height - paddingBottom + 15;

        // 格式化时间戳为 HH:MM:SS
        const time = new Date(result.timestamp).toLocaleTimeString("zh-CN", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });

        ctx.fillText(time, x, y);
      }

      // 如果只有一个结果，显示在中间
      if (results.length === 1) {
        const result = results[0];
        const x = paddingLeft + (width - paddingLeft - paddingRight) / 2;
        const y = height - paddingBottom + 15;

        const time = new Date(result.timestamp).toLocaleTimeString("zh-CN", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });

        ctx.fillText(time, x, y);
      }
    }
  }, [results]);

  return (
    <div className="w-full h-full relative">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}

export default function NetworkDebugModal({
  isOpen,
  onOpenChange,
  endpointId,
}: NetworkDebugModalProps) {
  const [targetAddress, setTargetAddress] = useState("");
  const [testCount, setTestCount] = useState(5);
  const [interval, setInterval] = useState(1000);

  const [isRunning, setIsRunning] = useState(false);
  const [isTestStarted, setIsTestStarted] = useState(false); // 新增：是否已开始测试
  const [isInitialLoading, setIsInitialLoading] = useState(false); // 新增：第一次测试的loading状态
  const [currentTest, setCurrentTest] = useState(0);
  const [results, setResults] = useState<TestResult[]>([]);
  const [stats, setStats] = useState<TestStats>({
    total: 0,
    success: 0,
    failed: 0,
    avgLatency: 0,
    maxLatency: 0,
    minLatency: Infinity,
    packetLoss: 0,
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const testIndexRef = useRef<number>(0); // 使用ref追踪测试索引
  const isRunningRef = useRef<boolean>(false); // 使用ref追踪运行状态

  // 清理资源
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // 计算统计数据
  const calculateStats = (testResults: TestResult[]): TestStats => {
    const total = testResults.length;
    const successResults = testResults.filter((r) => r.success);
    const success = successResults.length;
    const failed = total - success;

    const latencies = successResults
      .map((r) => r.latency)
      .filter((l): l is number => l !== undefined);
    const avgLatency =
      latencies.length > 0
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : 0;
    const maxLatency = latencies.length > 0 ? Math.max(...latencies) : 0;
    const minLatency = latencies.length > 0 ? Math.min(...latencies) : 0;
    const packetLoss = total > 0 ? (failed / total) * 100 : 0;

    return {
      total,
      success,
      failed,
      avgLatency: Math.round(avgLatency),
      maxLatency,
      minLatency: minLatency === Infinity ? 0 : minLatency,
      packetLoss: Math.round(packetLoss * 100) / 100,
    };
  };

  // 执行单次网络测试
  const performSingleTest = async (): Promise<TestResult> => {
    try {
      const response = await fetch(
        buildApiUrl(`/api/endpoints/${endpointId}/network-debug`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            target: targetAddress,
          }),
        },
      );

      if (response.ok) {
        const data = await response.json();

        // 接口现在直接返回结果对象，不再包装在 result 字段中
        if (data.timestamp !== undefined) {
          return {
            timestamp: data.timestamp,
            success: data.success,
            latency: data.latency,
            error: data.error,
          };
        } else {
          return {
            timestamp: Date.now(),
            success: false,
            error: data.error || "测试失败",
          };
        }
      } else {
        return {
          timestamp: Date.now(),
          success: false,
          error: `HTTP ${response.status}`,
        };
      }
    } catch (error) {
      return {
        timestamp: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : "网络错误",
      };
    }
  };

  // 开始测试
  const startTest = async () => {
    if (isRunning) return;

    console.log(
      `开始测试：目标=${targetAddress}, 次数=${testCount}, 间隔=${interval}ms`,
    );

    setIsTestStarted(true);
    setIsRunning(true);
    setIsInitialLoading(true); // 开始第一次测试的loading
    setCurrentTest(0);
    setResults([]);
    setStats({
      total: 0,
      success: 0,
      failed: 0,
      avgLatency: 0,
      maxLatency: 0,
      minLatency: Infinity,
      packetLoss: 0,
    });

    // 重置测试索引和运行状态
    testIndexRef.current = 0;
    isRunningRef.current = true;

    // 使用递归方式执行测试，避免定时器闭包问题
    const runTestSequence = async () => {
      const currentIndex = testIndexRef.current;

      if (currentIndex >= testCount) {
        setIsRunning(false);
        isRunningRef.current = false;
        addToast({
          title: "测试完成",
          description: `网络测试已完成，共执行 ${testCount} 次测试`,
          color: "success",
        });

        return;
      }

      setCurrentTest(currentIndex + 1);

      try {
        const result = await performSingleTest();

        // 第一次测试完成后关闭loading状态
        if (currentIndex === 0) {
          setIsInitialLoading(false);
        }

        setResults((prev) => {
          const newResults = [...prev, result];

          setStats(calculateStats(newResults));

          return newResults;
        });

        testIndexRef.current++;

        // 如果还有更多测试要执行，延迟后继续
        if (testIndexRef.current < testCount) {
          console.log(`等待 ${interval}ms 后执行下一次测试`);
          intervalRef.current = setTimeout(() => {
            // 检查是否仍在运行状态（用户可能已停止）
            if (isRunningRef.current) {
              runTestSequence();
            }
          }, interval);
        } else {
          // 所有测试完成
          console.log("所有测试完成");
          setIsRunning(false);
          isRunningRef.current = false;
          addToast({
            title: "测试完成",
            description: `网络测试已完成，共执行 ${testCount} 次测试`,
            color: "success",
          });
        }
      } catch (error) {
        console.error("测试执行失败:", error);
        testIndexRef.current++;

        // 即使失败也继续下一次测试
        if (testIndexRef.current < testCount) {
          intervalRef.current = setTimeout(() => {
            if (isRunningRef.current) {
              runTestSequence();
            }
          }, interval);
        } else {
          setIsRunning(false);
          isRunningRef.current = false;
          addToast({
            title: "测试完成",
            description: `网络测试已完成，共执行 ${testCount} 次测试`,
            color: "success",
          });
        }
      }
    };

    // 开始执行测试序列
    runTestSequence();
  };

  // 停止测试
  const stopTest = () => {
    console.log("手动停止测试");
    setIsRunning(false);
    isRunningRef.current = false; // 使用ref确保状态立即更新
    // 清理所有可能的定时器
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    addToast({
      title: "测试已停止",
      description: "网络测试已手动停止",
      color: "warning",
    });
  };

  // 重置测试
  const resetTest = () => {
    console.log("重置测试");
    if (isRunning) {
      stopTest();
    }
    setIsTestStarted(false); // 重置为未开始状态
    setIsInitialLoading(false); // 重置loading状态
    setCurrentTest(0);
    setResults([]);
    setStats({
      total: 0,
      success: 0,
      failed: 0,
      avgLatency: 0,
      maxLatency: 0,
      minLatency: Infinity,
      packetLoss: 0,
    });
    testIndexRef.current = 0; // 重置测试索引
    isRunningRef.current = false; // 重置运行状态
  };

  // 关闭模态窗时重置状态
  const handleModalClose = () => {
    resetTest();
    onOpenChange(false);
  };

  // 格式化时间戳
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <Modal
      classNames={{
        base: "max-h-[90vh]",
        body: "py-6",
        footer: "border-t border-divider",
      }}
      hideCloseButton={false}
      isOpen={isOpen}
      scrollBehavior="inside"
      size="4xl"
      onOpenChange={handleModalClose}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1 pb-0">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon
                  className="text-primary"
                  icon={faNetworkWired}
                />
                <span>网络调试</span>
              </div>
              <p className="text-sm text-default-500 font-normal">
                对指定地址进行网络连通性测试
              </p>
            </ModalHeader>

            <ModalBody>
              {!isTestStarted ? (
                // 测试参数配置页面
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Input
                        isRequired
                        label="目标地址"
                        placeholder="IP:端口 或 域名:端口"
                        value={targetAddress}
                        onValueChange={setTargetAddress}
                      />
                      <Input
                        label="测试次数"
                        max={100}
                        min={1}
                        type="number"
                        value={testCount.toString()}
                        onValueChange={(value) =>
                          setTestCount(parseInt(value) || 1)
                        }
                      />
                      <Input
                        label="间隔时间(ms)"
                        max={10000}
                        min={100}
                        type="number"
                        value={interval.toString()}
                        onValueChange={(value) =>
                          setInterval(parseInt(value) || 1000)
                        }
                      />
                    </div>
                  </div>
                </div>
              ) : isInitialLoading ? (
                // 第一次测试加载中
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <Spinner color="primary" size="lg" />
                  <div className="text-center">
                    <p className="text-lg font-medium">测试中...</p>
                    <p className="text-sm text-default-500">
                      正在连接目标地址进行网络测试
                    </p>
                  </div>
                </div>
              ) : (
                // 测试结果展示页面
                <div className="space-y-6">
                  {/* 连接质量统计 */}
                  {stats.total > 0 && (
                    <div className="space-y-4">
                      {/* <div className="flex items-center justify-start gap-2">
                        <h3 className="text-lg font-semibold">连接质量</h3>
                        <span className="text-sm text-default-500">
                        {isRunning
                          ? `测试中 ${currentTest}/${testCount}`
                          : "测试完成"}
                        </span>
                      </div> */}
                      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-success">
                            {stats.success}
                          </div>
                          <div className="text-sm text-default-500">成功</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-danger">
                            {stats.failed}
                          </div>
                          <div className="text-sm text-default-500">失败</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-warning">
                            {stats.packetLoss}%
                          </div>
                          <div className="text-sm text-default-500">丢包率</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-primary">
                            {stats.avgLatency}ms
                          </div>
                          <div className="text-sm text-default-500">
                            平均延迟
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-secondary">
                            {stats.maxLatency}ms
                          </div>
                          <div className="text-sm text-default-500">
                            最高延迟
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-secondary">
                            {stats.minLatency}ms
                          </div>
                          <div className="text-sm text-default-500">
                            最低延迟
                          </div>
                        </div>
                      </div>

                      {/* 延迟趋势图表 */}
                      {results.length > 1 && (
                        <>
                          <Divider />
                          <div className="space-y-2">
                            <div ref={chartRef} className="h-40 w-full">
                              <LatencyChart results={results} />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </ModalBody>

            <ModalFooter>
              <div className="flex justify-end w-full">
                <div className="flex gap-2">
                  {!isTestStarted ? (
                    <Button
                      color="primary"
                      isDisabled={!targetAddress.trim()}
                      startContent={<FontAwesomeIcon icon={faPlay} />}
                      variant="solid"
                      onPress={startTest}
                    >
                      开始测试
                    </Button>
                  ) : (
                    <>
                      <Button
                        isDisabled={isRunning}
                        variant="flat"
                        onPress={resetTest}
                      >
                        重新测试
                      </Button>
                      {isRunning && (
                        <Button
                          color="danger"
                          startContent={<FontAwesomeIcon icon={faStop} />}
                          variant="flat"
                          onPress={stopTest}
                        >
                          停止测试
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
