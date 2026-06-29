import {
  Button,
  Chip,
  Code,
  Divider,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Spinner,
} from "@heroui/react";
import { addToast } from "@heroui/toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFlask,
  faPlus,
  faRotateRight,
} from "@fortawesome/free-solid-svg-icons";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { buildApiUrl } from "@/lib/utils";

interface DebugCreateModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

interface Endpoint {
  id: string;
  name: string;
  url?: string;
  hostname?: string;
}

interface DebugRule {
  endpointId: number;
  name: string;
  url: string;
}

const parsePortRange = (value: string): number[] => {
  const trimmed = value.trim();

  if (!trimmed) return [];

  if (trimmed.includes("-")) {
    const [startRaw, endRaw] = trimmed.split("-");
    const start = Number(startRaw);
    const end = Number(endRaw);

    if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) {
      return [];
    }

    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }

  const single = Number(trimmed);

  return Number.isInteger(single) ? [single] : [];
};

const isValidPort = (port: number) => port > 0 && port <= 65535;

const randomPort = (usedPorts: Set<number>) => {
  const min = 20000;
  const max = 60000;

  for (let attempts = 0; attempts < 200; attempts++) {
    const port = Math.floor(Math.random() * (max - min + 1)) + min;

    if (!usedPorts.has(port)) {
      usedPorts.add(port);

      return port;
    }
  }

  let fallback = min;

  while (usedPorts.has(fallback) && fallback <= max) fallback++;
  usedPorts.add(fallback);

  return fallback;
};

const getEndpointHost = (endpoint?: Endpoint) => {
  const raw = endpoint?.hostname || endpoint?.url || "";

  if (!raw) return "";

  try {
    return new URL(raw).hostname || raw;
  } catch {
    return raw
      .replace(/^https?:\/\//, "")
      .split("/")[0]
      .split(":")[0];
  }
};

export default function DebugCreateModal({
  isOpen,
  onOpenChange,
  onSaved,
}: DebugCreateModalProps) {
  const { t } = useTranslation("tunnels");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [form, setForm] = useState({
    mode: "single",
    endpointId: "",
    serverEndpointId: "",
    clientEndpointId: "",
    targetAddress: "127.0.0.1",
    targetPortRange: "3000-3002",
    listenPortRange: "8000-8002",
  });

  useEffect(() => {
    if (!isOpen) return;

    const fetchEndpoints = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          buildApiUrl("/api/endpoints/simple?excludeFailed=true"),
        );

        if (!response.ok)
          throw new Error(t("debugCreate.toast.fetchEndpointsFailed"));

        const data = await response.json();
        const normalized = data.map((endpoint: Endpoint) => ({
          ...endpoint,
          id: String(endpoint.id),
        }));

        setEndpoints(normalized);
        if (normalized.length) {
          setForm((prev) => ({
            ...prev,
            endpointId: prev.endpointId || normalized[0].id,
            serverEndpointId: prev.serverEndpointId || normalized[0].id,
            clientEndpointId:
              prev.clientEndpointId || normalized[1]?.id || normalized[0].id,
          }));
        }
      } catch (error) {
        addToast({
          title: t("toast.fetchError"),
          description:
            error instanceof Error
              ? error.message
              : t("debugCreate.toast.fetchEndpointsFailed"),
          color: "danger",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchEndpoints();
  }, [isOpen, t]);

  const generatedRules = useMemo(() => {
    const targetPorts = parsePortRange(form.targetPortRange);
    const listenPorts = parsePortRange(form.listenPortRange);
    const targetAddress = form.targetAddress.trim();
    const rules: DebugRule[] = [];
    const usedTunnelPorts = new Set<number>();

    if (
      !targetAddress ||
      !targetPorts.length ||
      !listenPorts.length ||
      targetPorts.length !== listenPorts.length ||
      targetPorts.some((port) => !isValidPort(port)) ||
      listenPorts.some((port) => !isValidPort(port))
    ) {
      return rules;
    }

    if (form.mode === "single") {
      const endpointId = Number(form.endpointId);

      if (!endpointId) return rules;

      listenPorts.forEach((listenPort, index) => {
        const targetPort = targetPorts[index];

        rules.push({
          endpointId,
          name: `调试-单端-${listenPort}`,
          url: `client://:${listenPort}/${targetAddress}:${targetPort}`,
        });
      });

      return rules;
    }

    const serverEndpoint = endpoints.find(
      (endpoint) => endpoint.id === form.serverEndpointId,
    );
    const serverHost = getEndpointHost(serverEndpoint);
    const serverEndpointId = Number(form.serverEndpointId);
    const clientEndpointId = Number(form.clientEndpointId);

    if (!serverEndpointId || !clientEndpointId || !serverHost) return rules;

    listenPorts.forEach((listenPort, index) => {
      const targetPort = targetPorts[index];
      const tunnelPort = randomPort(usedTunnelPorts);

      rules.push({
        endpointId: serverEndpointId,
        name: `调试-server-${listenPort}`,
        url: `server://:${tunnelPort}/:${listenPort}`,
      });
      rules.push({
        endpointId: clientEndpointId,
        name: `调试-client-${listenPort}`,
        url: `client://${serverHost}:${tunnelPort}/${targetAddress}:${targetPort}`,
      });
    });

    return rules;
  }, [endpoints, form]);

  const validationMessage = useMemo(() => {
    const targetPorts = parsePortRange(form.targetPortRange);
    const listenPorts = parsePortRange(form.listenPortRange);

    if (!form.targetAddress.trim())
      return t("debugCreate.validation.targetAddress");
    if (!targetPorts.length) return t("debugCreate.validation.targetPortRange");
    if (!listenPorts.length) return t("debugCreate.validation.listenPortRange");
    if (targetPorts.some((port) => !isValidPort(port)))
      return t("debugCreate.validation.targetPortRange");
    if (listenPorts.some((port) => !isValidPort(port)))
      return t("debugCreate.validation.listenPortRange");
    if (targetPorts.length !== listenPorts.length)
      return t("debugCreate.validation.sameCount");
    if (form.mode === "single" && !form.endpointId)
      return t("debugCreate.validation.endpoint");
    if (
      form.mode === "double" &&
      (!form.serverEndpointId || !form.clientEndpointId)
    ) {
      return t("debugCreate.validation.doubleEndpoint");
    }
    if (form.mode === "double") {
      const serverEndpoint = endpoints.find(
        (endpoint) => endpoint.id === form.serverEndpointId,
      );

      if (!getEndpointHost(serverEndpoint))
        return t("debugCreate.validation.serverHost");
    }

    return "";
  }, [endpoints, form, t]);

  const handleSubmit = async () => {
    if (validationMessage || generatedRules.length === 0) {
      addToast({
        title: t("debugCreate.toast.invalidConfig"),
        description: validationMessage || t("debugCreate.validation.noRules"),
        color: "warning",
      });

      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch(buildApiUrl("/api/tunnels/quick-batch"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: generatedRules }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || t("debugCreate.toast.createFailed"));
      }

      addToast({
        title: t("debugCreate.toast.createSuccess"),
        description:
          result.message ||
          t("debugCreate.toast.createSuccessDesc", {
            count: generatedRules.length,
          }),
        color: "success",
      });
      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      addToast({
        title: t("debugCreate.toast.createFailed"),
        description:
          error instanceof Error
            ? error.message
            : t("debugCreate.toast.createFailed"),
        color: "danger",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const updateForm = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Modal
      isOpen={isOpen}
      scrollBehavior="inside"
      size="4xl"
      onOpenChange={onOpenChange}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex items-center gap-2">
              <FontAwesomeIcon className="text-primary" icon={faFlask} />
              {t("debugCreate.title")}
            </ModalHeader>
            <ModalBody>
              {loading ? (
                <div className="flex justify-center py-10">
                  <Spinner label={t("page.loading")} />
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Select
                      label={t("debugCreate.fields.mode")}
                      selectedKeys={[form.mode]}
                      onSelectionChange={(keys) =>
                        updateForm(
                          "mode",
                          String(Array.from(keys)[0] || "single"),
                        )
                      }
                    >
                      <SelectItem key="single">
                        {t("debugCreate.mode.single")}
                      </SelectItem>
                      <SelectItem key="double">
                        {t("debugCreate.mode.double")}
                      </SelectItem>
                    </Select>

                    {form.mode === "single" ? (
                      <Select
                        label={t("debugCreate.fields.endpoint")}
                        placeholder={t(
                          "debugCreate.fields.endpointPlaceholder",
                        )}
                        selectedKeys={form.endpointId ? [form.endpointId] : []}
                        onSelectionChange={(keys) =>
                          updateForm(
                            "endpointId",
                            String(Array.from(keys)[0] || ""),
                          )
                        }
                      >
                        {endpoints.map((endpoint) => (
                          <SelectItem key={endpoint.id}>
                            {endpoint.name}
                          </SelectItem>
                        ))}
                      </Select>
                    ) : (
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Select
                          label={t("debugCreate.fields.serverEndpoint")}
                          selectedKeys={
                            form.serverEndpointId ? [form.serverEndpointId] : []
                          }
                          onSelectionChange={(keys) =>
                            updateForm(
                              "serverEndpointId",
                              String(Array.from(keys)[0] || ""),
                            )
                          }
                        >
                          {endpoints.map((endpoint) => (
                            <SelectItem key={endpoint.id}>
                              {endpoint.name}
                            </SelectItem>
                          ))}
                        </Select>
                        <Select
                          label={t("debugCreate.fields.clientEndpoint")}
                          selectedKeys={
                            form.clientEndpointId ? [form.clientEndpointId] : []
                          }
                          onSelectionChange={(keys) =>
                            updateForm(
                              "clientEndpointId",
                              String(Array.from(keys)[0] || ""),
                            )
                          }
                        >
                          {endpoints.map((endpoint) => (
                            <SelectItem key={endpoint.id}>
                              {endpoint.name}
                            </SelectItem>
                          ))}
                        </Select>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <Input
                      isRequired
                      label={t("debugCreate.fields.targetAddress")}
                      placeholder="127.0.0.1"
                      value={form.targetAddress}
                      onValueChange={(value) =>
                        updateForm("targetAddress", value)
                      }
                    />
                    <Input
                      isRequired
                      label={t("debugCreate.fields.targetPortRange")}
                      placeholder="3000-3009"
                      value={form.targetPortRange}
                      onValueChange={(value) =>
                        updateForm("targetPortRange", value)
                      }
                    />
                    <Input
                      isRequired
                      label={t("debugCreate.fields.listenPortRange")}
                      placeholder="8000-8009"
                      value={form.listenPortRange}
                      onValueChange={(value) =>
                        updateForm("listenPortRange", value)
                      }
                    />
                  </div>

                  <Divider />

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Chip
                        color={validationMessage ? "warning" : "success"}
                        variant="flat"
                      >
                        {validationMessage || t("debugCreate.preview.ready")}
                      </Chip>
                      <Chip variant="flat">
                        {t("debugCreate.preview.count", {
                          count: generatedRules.length,
                        })}
                      </Chip>
                    </div>
                    <Button
                      size="sm"
                      startContent={<FontAwesomeIcon icon={faRotateRight} />}
                      variant="flat"
                      onPress={() => setForm((prev) => ({ ...prev }))}
                    >
                      {t("debugCreate.preview.refreshRandom")}
                    </Button>
                  </div>

                  <div className="max-h-72 space-y-2 overflow-auto rounded-lg border border-default-200 bg-default-50 p-3">
                    {generatedRules.length > 0 ? (
                      generatedRules.map((rule, index) => (
                        <div
                          key={`${rule.endpointId}-${rule.name}-${index}`}
                          className="grid grid-cols-1 gap-2 rounded-md bg-background p-2 text-sm md:grid-cols-[160px_1fr]"
                        >
                          <span className="text-default-500">{rule.name}</span>
                          <Code className="whitespace-normal break-all">
                            {rule.url}
                          </Code>
                        </div>
                      ))
                    ) : (
                      <div className="py-8 text-center text-sm text-default-500">
                        {validationMessage || t("debugCreate.preview.empty")}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose}>
                {t("delete.cancel")}
              </Button>
              <Button
                color="primary"
                isDisabled={
                  Boolean(validationMessage) || generatedRules.length === 0
                }
                isLoading={submitting}
                startContent={!submitting && <FontAwesomeIcon icon={faPlus} />}
                onPress={handleSubmit}
              >
                {t("debugCreate.submit")}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
