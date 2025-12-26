import React from "react";
import {
  Card,
  CardHeader,
  CardBody,
  Switch,
  Button,
  RadioGroup,
  Radio,
  Select,
  SelectItem,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMoon,
  faSun,
  faComputerMouse,
} from "@fortawesome/free-solid-svg-icons";
import { useTranslation } from "react-i18next";

export function SystemSettings() {
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1">
          <h3 className="text-xl font-semibold text-foreground">{t("system.title")}</h3>
          <p className="text-small text-default-500">
            {t("system.description")}
          </p>
        </div>
      </CardHeader>
      <CardBody className="space-y-6">
        {/* Theme Settings */}
        <div className="space-y-4">
          <h4 className="text-medium font-medium text-foreground">{t("system.themeSettings.title")}</h4>

          <RadioGroup defaultValue="system" orientation="horizontal">
            <div className="flex items-center gap-6">
              <Radio value="light">
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon className="w-4 h-4" icon={faSun} />
                  <span>{tCommon("theme.light")}</span>
                </div>
              </Radio>
              <Radio value="dark">
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon className="w-4 h-4" icon={faMoon} />
                  <span>{tCommon("theme.dark")}</span>
                </div>
              </Radio>
              <Radio value="system">
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon className="w-4 h-4" icon={faComputerMouse} />
                  <span>{tCommon("theme.system")}</span>
                </div>
              </Radio>
            </div>
          </RadioGroup>
        </div>

        {/* Language Settings */}
        <div className="space-y-4">
          <h4 className="text-medium font-medium text-foreground">{t("system.languageSettings.title")}</h4>
          <Select
            className="max-w-xs"
            defaultSelectedKeys={["zh-CN"]}
            label={t("system.languageSettings.label")}
          >
            <SelectItem key="zh-CN">
              {tCommon("language.zhCN")}
            </SelectItem>
            <SelectItem key="en-US">
              {tCommon("language.enUS")}
            </SelectItem>
          </Select>
        </div>

        {/* Behavior Settings */}
        <div className="space-y-4">
          <h4 className="text-medium font-medium text-foreground">{t("system.behaviorSettings.title")}</h4>

          {/* Auto Save */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-foreground">{t("system.behaviorSettings.autoSave.title")}</p>
              <p className="text-small text-default-500">
                {t("system.behaviorSettings.autoSave.description")}
              </p>
            </div>
            <Switch defaultSelected />
          </div>

          {/* Auto Update */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-foreground">{t("system.behaviorSettings.autoUpdate.title")}</p>
              <p className="text-small text-default-500">{t("system.behaviorSettings.autoUpdate.description")}</p>
            </div>
            <Switch defaultSelected />
          </div>

          {/* Telemetry */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-foreground">{t("system.behaviorSettings.telemetry.title")}</p>
              <p className="text-small text-default-500">
                {t("system.behaviorSettings.telemetry.description")}
              </p>
            </div>
            <Switch />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4">
          <Button color="danger" variant="light">
            {t("system.actions.reset")}
          </Button>
          <Button color="primary">{t("system.actions.save")}</Button>
        </div>
      </CardBody>
    </Card>
  );
}
