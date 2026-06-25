import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Chip,
  Divider,
  Input,
  Select,
  SelectItem,
  Spinner,
  Switch,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";

import {
  DriverKind,
  initializeDatabase,
  SetupPayload,
  testConnection,
} from "@/lib/api/setup";
import Image from "@/components/common/image";
import RowSteps from "@/components/ui/row-steps";
import { useSettings } from "@/components/providers/settings-provider";

type Step = 1 | 2 | 3 | 4;

interface FormState {
  driver: DriverKind | null;
  sqlitePath: string;
  sqliteWAL: boolean;
  pgHost: string;
  pgPort: string;
  pgDatabase: string;
  pgUser: string;
  pgPassword: string;
  pgSSL: string;
  pgTimezone: string;
  adminUser: string;
  adminPass: string;
  adminConfirm: string;
  adminAck: boolean;
}

const initialForm = (): FormState => ({
  driver: null,
  sqlitePath: "db/database.db",
  sqliteWAL: true,
  pgHost: "127.0.0.1",
  pgPort: "5432",
  pgDatabase: "nodepass",
  pgUser: "postgres",
  pgPassword: "",
  pgSSL: "disable",
  pgTimezone:
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || "Local"
      : "Local",
  adminUser: "admin",
  adminPass: "",
  adminConfirm: "",
  adminAck: false,
});

function buildPayload(form: FormState, includeAdmin: boolean): SetupPayload {
  const payload: SetupPayload = { driver: form.driver as DriverKind };
  if (form.driver === "sqlite") {
    payload.sqlite = { path: form.sqlitePath, wal_mode: form.sqliteWAL };
  } else if (form.driver === "postgres") {
    payload.postgres = {
      host: form.pgHost,
      port: Number(form.pgPort) || 5432,
      user: form.pgUser,
      password: form.pgPassword,
      database: form.pgDatabase,
      ssl_mode: form.pgSSL,
      timezone: form.pgTimezone,
    };
  }
  if (includeAdmin) {
    payload.admin = { username: form.adminUser, password: form.adminPass };
  }
  return payload;
}

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

export default function SetupPage() {
  const { t } = useTranslation("db-setup");
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>(initialForm);

  // Step 3 (connection) state
  const [testing, setTesting] = useState(false);
  const [testOK, setTestOK] = useState(false);
  const [testError, setTestError] = useState("");

  // Step 4 (admin) state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [adminErrors, setAdminErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  // Countdown overlay after submit
  const [countdown, setCountdown] = useState<number | null>(null);

  // 跟 /login 一致:按主题切换 logo
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const logoSrc = isDark ? "/nodepass-logo-3.svg" : "/nodepass-logo-1.svg";

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (
      ["driver", "sqlitePath", "sqliteWAL", "pgHost", "pgPort", "pgUser", "pgPassword", "pgDatabase", "pgSSL", "pgTimezone"].includes(
        key as string,
      )
    ) {
      setTestOK(false);
      setTestError("");
    }
  };

  const canGoToStep4 = useMemo(() => testOK, [testOK]);

  const validateAdminStep = (): boolean => {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.adminUser) errs.adminUser = t("step4.errors.usernameRequired");
    else if (!USERNAME_RE.test(form.adminUser)) errs.adminUser = t("step4.errors.usernameInvalid");
    if (!form.adminPass) errs.adminPass = t("step4.errors.passwordRequired");
    else if (form.adminPass.length < 8) errs.adminPass = t("step4.errors.passwordTooShort");
    if (form.adminPass !== form.adminConfirm) errs.adminConfirm = t("step4.confirmMismatch");
    if (!form.adminAck) errs.adminAck = t("step4.errors.confirmRequired");
    setAdminErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleTest = async () => {
    setTesting(true);
    setTestOK(false);
    setTestError("");
    try {
      await testConnection(buildPayload(form, false));
      setTestOK(true);
    } catch (e) {
      setTestError(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async () => {
    if (!validateAdminStep()) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      await initializeDatabase(buildPayload(form, true));
      setCountdown(15);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  // 倒计时结束后跳转登录
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      navigate("/login", { replace: true });
      return;
    }
    const timer = window.setTimeout(() => setCountdown((c) => (c !== null ? c - 1 : null)), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown, navigate]);

  const stepperSteps = [
    { title: t("stepper.step1") },
    { title: t("stepper.step2") },
    { title: t("stepper.step3") },
    { title: t("stepper.step4") },
  ];

  const rowStepValue = step;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background to-default-100 relative">
      {countdown !== null && <CountdownOverlay seconds={countdown} />}
      <div className="flex-1 flex items-center justify-center p-4">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-3xl"
          initial={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="shadow-2xl">
            <CardHeader className="flex flex-col gap-1 items-center pb-6 pt-8">
              <motion.div
                animate={{ scale: 1 }}
                className="w-16 h-16 flex items-center justify-center mb-2"
                initial={{ scale: 0 }}
                transition={{ delay: 0.2, type: "spring" }}
              >
                <Image
                  priority
                  alt="NodePassDash Logo"
                  height={64}
                  src={logoSrc}
                  width={64}
                />
              </motion.div>

              <h1 className="text-2xl font-bold text-foreground">
                {t("title")}
              </h1>
            </CardHeader>

            <CardBody className="px-8 pb-8 space-y-6">
              <RowSteps currentStep={rowStepValue} steps={stepperSteps} />

              <Divider />

              {step === 1 && (
                <StepPreferences onNext={() => setStep(2)} />
              )}

              {step === 2 && (
                <StepDriver
                  value={form.driver}
                  onChange={(d) => setField("driver", d)}
                  onBack={() => setStep(1)}
                  onNext={() => form.driver && setStep(3)}
                />
              )}

              {step === 3 && (
                <StepConnection
                  form={form}
                  setField={setField}
                  testing={testing}
                  testOK={testOK}
                  testError={testError}
                  onTest={handleTest}
                  onBack={() => setStep(2)}
                  onNext={() => setStep(4)}
                  canGoNext={canGoToStep4}
                />
              )}

              {step === 4 && (
                <StepAdmin
                  form={form}
                  setField={setField}
                  errors={adminErrors}
                  submitting={submitting}
                  submitError={submitError}
                  onBack={() => setStep(3)}
                  onSubmit={handleSubmit}
                />
              )}

            </CardBody>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

// ============= Sub-components =============

function StepPreferences({ onNext }: { onNext: () => void }) {
  const { t } = useTranslation("db-setup");
  const { settings, updateTheme, updateLanguage } = useSettings();
  const theme = settings.theme || "system";
  const language = settings.language || "zh-CN";

  const themeOptions: { key: "light" | "dark" | "system"; icon: string }[] = [
    { key: "light", icon: "solar:sun-bold" },
    { key: "dark", icon: "solar:moon-bold" },
    { key: "system", icon: "lucide:monitor" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">{t("step1.title")}</h2>
        <p className="text-sm text-default-500">{t("step1.description")}</p>
      </div>

      <div className="space-y-3">
        <div className="text-sm font-medium flex items-center gap-2">
          <Icon icon="solar:palette-bold" />
          {t("step1.theme.label")}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {themeOptions.map((opt) => {
            const active = theme === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => updateTheme(opt.key)}
                className={[
                  "flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all",
                  active
                    ? "border-primary bg-primary/5"
                    : "border-default-200 hover:border-default-300 bg-content2/40",
                ].join(" ")}
              >
                <Icon
                  icon={opt.icon}
                  width={28}
                  className={active ? "text-primary" : "text-default-500"}
                />
                <span className={["text-sm", active ? "font-semibold text-primary" : "text-default-600"].join(" ")}>
                  {t(`step1.theme.${opt.key}`)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-sm font-medium flex items-center gap-2">
          <Icon icon="lucide:languages" />
          {t("step1.language.label")}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: "zh-CN" as const, icon: "circle-flags:cn", labelKey: "step1.language.zh" },
            { key: "en-US" as const, icon: "circle-flags:us", labelKey: "step1.language.en" },
          ].map((opt) => {
            const active = language === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => updateLanguage(opt.key)}
                className={[
                  "flex items-center justify-center gap-3 p-4 rounded-xl border-2 transition-all",
                  active
                    ? "border-primary bg-primary/5"
                    : "border-default-200 hover:border-default-300 bg-content2/40",
                ].join(" ")}
              >
                <Icon icon={opt.icon} width={24} />
                <span className={["text-sm", active ? "font-semibold text-primary" : "text-default-600"].join(" ")}>
                  {t(opt.labelKey)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <Button color="primary" onPress={onNext}>
          {t("buttons.next")}
        </Button>
      </div>
    </div>
  );
}

function StepDriver({
  value,
  onChange,
  onBack,
  onNext,
}: {
  value: DriverKind | null;
  onChange: (d: DriverKind) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation("db-setup");
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">{t("step2.title")}</h2>
        <p className="text-sm text-default-500">{t("step2.description")}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DriverCard
          active={value === "sqlite"}
          icon="simple-icons:sqlite"
          name={t("step2.sqlite.name")}
          tag={t("step2.sqlite.tag")}
          desc={t("step2.sqlite.description")}
          onClick={() => onChange("sqlite")}
        />
        <DriverCard
          active={value === "postgres"}
          icon="simple-icons:postgresql"
          name={t("step2.postgres.name")}
          tag={t("step2.postgres.tag")}
          desc={t("step2.postgres.description")}
          onClick={() => onChange("postgres")}
        />
      </div>
      <div className="flex justify-between">
        <Button variant="bordered" onPress={onBack}>
          {t("buttons.back")}
        </Button>
        <Button color="primary" isDisabled={!value} onPress={onNext}>
          {t("buttons.next")}
        </Button>
      </div>
    </div>
  );
}

function DriverCard({
  active,
  icon,
  name,
  tag,
  desc,
  onClick,
}: {
  active: boolean;
  icon: string;
  name: string;
  tag: string;
  desc: string;
  onClick: () => void;
}) {
  // 用 HeroUI Card + isPressable;选中态用 HeroUI 的 ring / text-primary token。
  // 不再使用裸 Tailwind 边框颜色,所有视觉变化都走主题 token。
  return (
    <Card
      isPressable
      isHoverable
      onPress={onClick}
      shadow={active ? "md" : "none"}
      classNames={{
        base: [
          "border-2 transition-all",
          active
            ? "border-primary bg-primary-50/40 dark:bg-primary-900/10"
            : "border-default-200 bg-content2/40",
        ].join(" "),
      }}
    >
      <CardBody className="p-5 gap-3">
        {/* 顶部对齐 — icon 与 label 块 items-start */}
        <div className="flex items-start gap-3">
          <Icon
            icon={icon}
            className={[
              "w-8 h-8 shrink-0 transition-colors",
              active ? "text-primary" : "text-default-600",
            ].join(" ")}
          />
          <div className="flex flex-col gap-1 min-w-0">
            <div
              className={[
                "font-semibold leading-tight",
                active ? "text-primary" : "text-foreground",
              ].join(" ")}
            >
              {name}
            </div>
            <Chip
              size="sm"
              variant="flat"
              color={active ? "primary" : "default"}
            >
              {tag}
            </Chip>
          </div>
        </div>
        <p className="text-xs text-default-500 leading-relaxed">{desc}</p>
      </CardBody>
    </Card>
  );
}

function StepConnection({
  form,
  setField,
  testing,
  testOK,
  testError,
  onTest,
  onBack,
  onNext,
  canGoNext,
}: {
  form: FormState;
  setField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  testing: boolean;
  testOK: boolean;
  testError: string;
  onTest: () => void;
  onBack: () => void;
  onNext: () => void;
  canGoNext: boolean;
}) {
  const { t } = useTranslation("db-setup");
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">{t("step3.title")}</h2>

      {form.driver === "sqlite" && (
        <div className="space-y-4">
          <Input
            label={t("step3.sqlite.pathLabel")}
            value={form.sqlitePath}
            isReadOnly
            description={t("step3.sqlite.pathHelp")}
          />
          <div className="flex items-center gap-3">
            <Switch
              isSelected={form.sqliteWAL}
              onValueChange={(v) => setField("sqliteWAL", v)}
            >
              {t("step3.sqlite.walLabel")}
            </Switch>
          </div>
        </div>
      )}

      {form.driver === "postgres" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Input
              className="col-span-2"
              label={t("step3.postgres.hostLabel")}
              value={form.pgHost}
              onValueChange={(v) => setField("pgHost", v)}
            />
            <Input
              label={t("step3.postgres.portLabel")}
              value={form.pgPort}
              onValueChange={(v) => setField("pgPort", v)}
            />
          </div>
          <Input
            label={t("step3.postgres.dbLabel")}
            value={form.pgDatabase}
            onValueChange={(v) => setField("pgDatabase", v)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t("step3.postgres.userLabel")}
              value={form.pgUser}
              onValueChange={(v) => setField("pgUser", v)}
            />
            <Input
              label={t("step3.postgres.passwordLabel")}
              type="password"
              value={form.pgPassword}
              onValueChange={(v) => setField("pgPassword", v)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label={t("step3.postgres.sslLabel")}
              selectedKeys={new Set([form.pgSSL])}
              onSelectionChange={(keys) => {
                const v = Array.from(keys)[0];
                if (typeof v === "string") setField("pgSSL", v);
              }}
            >
              <SelectItem key="disable">{t("step3.postgres.sslOptions.disable")}</SelectItem>
              <SelectItem key="require">{t("step3.postgres.sslOptions.require")}</SelectItem>
              <SelectItem key="verify-full">{t("step3.postgres.sslOptions.verifyFull")}</SelectItem>
            </Select>
            <Input
              label={t("step3.postgres.timezoneLabel")}
              value={form.pgTimezone}
              onValueChange={(v) => setField("pgTimezone", v)}
            />
          </div>
          <p className="text-xs text-default-500">{t("step3.postgres.tip")}</p>
        </div>
      )}

      <div className="rounded-lg p-3 border border-default-200 bg-content2/30 min-h-[48px] flex items-center">
        {testing && (
          <div className="flex items-center gap-2 text-sm text-default-500">
            <Spinner size="sm" />
            {t("step3.testing")}
          </div>
        )}
        {!testing && testOK && (
          <div className="flex items-center gap-2 text-sm text-success">
            <Icon icon="solar:check-circle-bold" />
            {t("step3.testSuccess")}
          </div>
        )}
        {!testing && !testOK && testError && (
          <div className="flex items-start gap-2 text-sm text-danger break-all">
            <Icon icon="solar:close-circle-bold" className="mt-0.5 flex-shrink-0" />
            <span>
              {t("step3.testFailedPrefix")}
              {testError}
            </span>
          </div>
        )}
        {!testing && !testOK && !testError && (
          <div className="flex items-center gap-2 text-sm text-default-400">
            <Icon icon="solar:info-circle-linear" className="flex-shrink-0" />
            {t("step3.testIdle")}
          </div>
        )}
      </div>

      <div className="flex justify-between gap-2">
        <Button variant="bordered" onPress={onBack}>
          {t("buttons.back")}
        </Button>
        <div className="flex gap-2">
          <Button color="default" isLoading={testing} onPress={onTest}>
            {testOK ? t("buttons.retry") : t("buttons.test")}
          </Button>
          <Button color="primary" isDisabled={!canGoNext} onPress={onNext}>
            {t("buttons.next")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StepAdmin({
  form,
  setField,
  errors,
  submitting,
  submitError,
  onBack,
  onSubmit,
}: {
  form: FormState;
  setField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  errors: Partial<Record<keyof FormState, string>>;
  submitting: boolean;
  submitError: string;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation("db-setup");
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">{t("step4.title")}</h2>
        <p className="text-sm text-default-500">{t("step4.description")}</p>
      </div>

      <div className="space-y-4">
        <Input
          label={t("step4.usernameLabel")}
          description={t("step4.usernameHelp")}
          value={form.adminUser}
          onValueChange={(v) => setField("adminUser", v)}
          isInvalid={!!errors.adminUser}
          errorMessage={errors.adminUser}
        />
        <Input
          label={t("step4.passwordLabel")}
          description={t("step4.passwordHelp")}
          type="password"
          value={form.adminPass}
          onValueChange={(v) => setField("adminPass", v)}
          isInvalid={!!errors.adminPass}
          errorMessage={errors.adminPass}
        />
        <Input
          label={t("step4.confirmLabel")}
          type="password"
          value={form.adminConfirm}
          onValueChange={(v) => setField("adminConfirm", v)}
          isInvalid={!!errors.adminConfirm}
          errorMessage={errors.adminConfirm}
        />
        <Checkbox
          isSelected={form.adminAck}
          onValueChange={(v) => setField("adminAck", v)}
          isInvalid={!!errors.adminAck}
        >
          {t("step4.confirmCheckbox")}
        </Checkbox>
        {errors.adminAck && (
          <p className="text-xs text-danger">{errors.adminAck}</p>
        )}
      </div>

      {submitError && (
        <div className="rounded-lg p-3 border border-danger-200 bg-danger-50 text-sm text-danger break-all">
          {t("errors.submitFailedPrefix")}
          {submitError}
        </div>
      )}

      {submitting && (
        <div className="flex items-center gap-2 text-sm text-default-500">
          <Spinner size="sm" />
          {t("step4.submitting")}
        </div>
      )}

      <div className="flex justify-between gap-2">
        <Button variant="bordered" onPress={onBack} isDisabled={submitting}>
          {t("buttons.back")}
        </Button>
        <Button color="primary" isLoading={submitting} onPress={onSubmit}>
          {t("buttons.submit")}
        </Button>
      </div>
    </div>
  );
}

const COUNTDOWN_TOTAL = 15;

function CountdownOverlay({ seconds }: { seconds: number }) {
  const { t } = useTranslation("db-setup");
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const progress = (COUNTDOWN_TOTAL - seconds) / COUNTDOWN_TOTAL;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center gap-8 text-center px-8"
      >
        {/* 圆形倒计时进度 */}
        <div className="relative w-36 h-36">
          <svg className="w-36 h-36 -rotate-90" viewBox="0 0 120 120">
            <circle
              cx="60" cy="60" r={radius}
              fill="none" strokeWidth="6"
              className="stroke-default-200"
            />
            <circle
              cx="60" cy="60" r={radius}
              fill="none" strokeWidth="6"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress)}
              strokeLinecap="round"
              className="stroke-primary transition-all duration-1000 ease-linear"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-5xl font-bold tabular-nums text-foreground">{seconds}</span>
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold text-foreground">{t("countdown.title")}</h2>
          <p className="text-sm text-default-500">
            {t("countdown.subtitle", { seconds })}
          </p>
        </div>

        <Spinner size="lg" color="primary" />
      </motion.div>
    </motion.div>
  );
}
