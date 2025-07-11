import _ from "lodash";
import React from "react";
import log from "loglevel";
import type { WidgetState } from "widgets/BaseWidget";
import { EventType } from "constants/AppsmithActionConstants/ActionConstants";

import { CurrencyInputComponent } from "../component";
import derivedProperties from "./parsedDerivedProperties";
import {
  formatCurrencyNumber,
  limitDecimalValue,
} from "../component/utilities";
import {
  getLocale,
  klonaRegularWithTelemetry,
  mergeWidgetConfig,
} from "utils/helpers";
import {
  getLocaleDecimalSeperator,
  getLocaleThousandSeparator,
} from "widgets/WidgetUtils";
import type { SetterConfig, Stylesheet } from "entities/AppTheming";
import type {
  AnvilConfig,
  AutocompletionDefinitions,
} from "WidgetProvider/types";
import * as config from "../config";
import type { CurrencyInputWidgetProps } from "./types";
import { WDSBaseInputWidget } from "widgets/wds/WDSBaseInputWidget";
import { getCountryCodeFromCurrencyCode, validateInput } from "./helpers";
import type { KeyDownEvent } from "widgets/wds/WDSBaseInputWidget/component/types";
import { appsmithTelemetry } from "instrumentation";

class WDSCurrencyInputWidget extends WDSBaseInputWidget<
  CurrencyInputWidgetProps,
  WidgetState
> {
  static type = "WDS_CURRENCY_INPUT_WIDGET";

  static getConfig() {
    return config.metaConfig;
  }

  static getFeatures() {
    return config.featuresConfig;
  }

  static getDefaults() {
    return config.defaultsConfig;
  }

  static getAnvilConfig(): AnvilConfig | null {
    return config.anvilConfig;
  }

  static getAutocompleteDefinitions(): AutocompletionDefinitions {
    return config.autocompleteConfig;
  }

  static getSetterConfig(): SetterConfig {
    return config.settersConfig;
  }

  static getMethods() {
    return config.methodsConfig;
  }

  static getPropertyPaneContentConfig() {
    const parentConfig = klonaRegularWithTelemetry(
      super.getPropertyPaneContentConfig(),
      "WDSCurrencyInputWidget.getPropertyPaneContentConfig",
    );
    const labelSectionIndex = parentConfig.findIndex(
      (section) => section.sectionName === "Label",
    );
    const labelPropertyIndex = parentConfig[
      labelSectionIndex
    ].children.findIndex((property) => property.propertyName === "label");

    parentConfig[labelSectionIndex].children[labelPropertyIndex] = {
      ...parentConfig[labelSectionIndex].children[labelPropertyIndex],
      placeholderText: "Current Price",
      // TODO: Fix this the next time the file is edited
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const generalSectionIndex = parentConfig.findIndex(
      (section) => section.sectionName === "General",
    );
    const tooltipPropertyIndex = parentConfig[
      generalSectionIndex
    ].children.findIndex((property) => property.propertyName === "tooltip");

    parentConfig[generalSectionIndex].children[tooltipPropertyIndex] = {
      ...parentConfig[generalSectionIndex].children[tooltipPropertyIndex],
      placeholderText:
        "Prices in other currencies should be recalculated in USD",
      // TODO: Fix this the next time the file is edited
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const placeholderPropertyIndex = parentConfig[
      generalSectionIndex
    ].children.findIndex(
      (property) => property.propertyName === "placeholderText",
    );

    parentConfig[generalSectionIndex].children[placeholderPropertyIndex] = {
      ...parentConfig[generalSectionIndex].children[placeholderPropertyIndex],
      placeholderText: "10",
      // TODO: Fix this the next time the file is edited
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    return mergeWidgetConfig(config.propertyPaneContentConfig, parentConfig);
  }

  static getPropertyPaneStyleConfig() {
    return super.getPropertyPaneStyleConfig();
  }

  static getDerivedPropertiesMap() {
    return {
      isValid: `{{(() => {${derivedProperties.isValid}})()}}`,
    };
  }

  // TODO: Fix this the next time the file is edited
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static getMetaPropertiesMap(): Record<string, any> {
    return _.merge(super.getMetaPropertiesMap(), {
      rawText: "",
      text: "",
      currencyCode: undefined,
    });
  }

  static getDefaultPropertiesMap(): Record<string, string> {
    return _.merge(super.getDefaultPropertiesMap(), {
      currencyCode: "defaultCurrencyCode",
      rawText: "defaultText",
      text: "defaultText",
    });
  }

  static getStylesheetConfig(): Stylesheet {
    return {};
  }

  componentDidMount() {
    this.formatText();
  }

  componentDidUpdate(prevProps: CurrencyInputWidgetProps) {
    if (
      prevProps.text !== this.props.text &&
      !this.props.isFocused &&
      this.props.text === String(this.props.defaultText)
    ) {
      this.formatText();
    }

    // If defaultText property has changed, reset isDirty to false
    if (
      this.props.defaultText !== prevProps.defaultText &&
      this.props.isDirty
    ) {
      this.props.updateWidgetMetaProperty("isDirty", false);
    }

    if (
      this.props.currencyCode === this.props.defaultCurrencyCode &&
      prevProps.currencyCode !== this.props.currencyCode
    ) {
      this.onCurrencyChange(this.props.currencyCode);
    }
  }

  onValueChange = (value: string) => {
    let formattedValue = "";
    const decimalSeperator = getLocaleDecimalSeperator();

    try {
      if (value && value.includes(decimalSeperator)) {
        formattedValue = limitDecimalValue(this.props.decimals, value);
      } else {
        formattedValue = value;
      }
    } catch (e) {
      formattedValue = value;
      log.error(e);
      appsmithTelemetry.captureException(e, {
        errorName: "WDSCurrencyInputWidget",
      });
    }

    this.props.updateWidgetMetaProperty("text", String(formattedValue));

    this.props.updateWidgetMetaProperty("rawText", value, {
      triggerPropertyName: "onTextChanged",
      dynamicString: this.props.onTextChanged,
      event: {
        type: EventType.ON_TEXT_CHANGE,
      },
    });

    if (!this.props.isDirty) {
      this.props.updateWidgetMetaProperty("isDirty", true);
    }
  };

  onFocusChange = (isFocused?: boolean) => {
    // We don't want to deformat or the text or trigger
    // any event on focus if the widget is read only
    if (Boolean(this.props.isReadOnly)) return;

    try {
      if (isFocused) {
        const text = this.props.text || "";
        const deFormattedValue = text.replace(
          new RegExp("\\" + getLocaleThousandSeparator(), "g"),
          "",
        );

        this.props.updateWidgetMetaProperty("text", deFormattedValue);
        this.props.updateWidgetMetaProperty("isFocused", isFocused, {
          triggerPropertyName: "onFocus",
          dynamicString: this.props.onFocus,
          event: {
            type: EventType.ON_FOCUS,
          },
        });
      } else {
        if (this.props.text) {
          const formattedValue = formatCurrencyNumber(
            this.props.decimals,
            this.props.text,
          );

          this.props.updateWidgetMetaProperty("text", formattedValue);
        }

        this.props.updateWidgetMetaProperty("isFocused", isFocused, {
          triggerPropertyName: "onBlur",
          dynamicString: this.props.onBlur,
          event: {
            type: EventType.ON_BLUR,
          },
        });
      }
    } catch (e) {
      log.error(e);
      appsmithTelemetry.captureException(e, {
        errorName: "WDSCurrencyInputWidget",
      });
      this.props.updateWidgetMetaProperty("text", this.props.text);
    }

    super.onFocusChange(!!isFocused);
  };

  onCurrencyChange = (
    currencyCode?: Parameters<typeof getCountryCodeFromCurrencyCode>[0],
  ) => {
    const countryCode = getCountryCodeFromCurrencyCode(currencyCode);

    this.props.updateWidgetMetaProperty("countryCode", countryCode);
    this.props.updateWidgetMetaProperty("currencyCode", currencyCode);
  };

  onKeyDown = (e: KeyDownEvent) => {
    // don't allow entering anything other than numbers. but allow backspace, arrows delete, tab, enter
    if (
      !(
        (e.key >= "0" && e.key <= "9") ||
        // allow . or comma if decimals are allowed
        (this.props.decimals &&
          (e.key === getLocaleDecimalSeperator() ||
            e.key === getLocaleThousandSeparator())) ||
        (e.key >= "0" && e.key <= "9" && e.code.includes("Numpad")) ||
        e.key === "Backspace" ||
        e.key === "Tab" ||
        e.key === "Enter" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "Delete" ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      )
    ) {
      e.preventDefault();
    }

    super.onKeyDown(e);
  };

  isTextFormatted = () => {
    return this.props.text.includes(getLocaleThousandSeparator());
  };

  formatText() {
    if (!!this.props.text && !this.isTextFormatted()) {
      try {
        const floatVal = parseFloat(this.props.text);

        const formattedValue = Intl.NumberFormat(getLocale(), {
          style: "decimal",
          minimumFractionDigits: this.props.decimals,
          maximumFractionDigits: this.props.decimals,
        }).format(floatVal);

        this.props.updateWidgetMetaProperty("text", formattedValue);
      } catch (e) {
        log.error(e);
        appsmithTelemetry.captureException(e, {
          errorName: "WDSCurrencyInputWidget",
        });
      }
    }
  }

  getWidgetView() {
    const value = this.props.rawText ?? "";
    const validation = validateInput(this.props);

    return (
      <CurrencyInputComponent
        allowCurrencyChange={this.props.allowCurrencyChange}
        autoFocus={this.props.autoFocus}
        currencyCode={this.props.currencyCode}
        defaultValue={this.props.defaultText}
        errorMessage={validation.errorMessage}
        excludeFromTabOrder={this.props.disableWidgetInteraction}
        isDisabled={this.props.isDisabled}
        isLoading={this.props.isLoading}
        isReadOnly={this.props.isReadOnly}
        isRequired={this.props.isRequired}
        label={this.props.label}
        onCurrencyChange={this.onCurrencyChange}
        onFocusChange={this.onFocusChange}
        onKeyDown={this.onKeyDown}
        onValueChange={this.onValueChange}
        placeholder={this.props.placeholderText}
        tooltip={this.props.tooltip}
        validationStatus={validation.validationStatus}
        value={value}
        widgetId={this.props.widgetId}
      />
    );
  }
}

export { WDSCurrencyInputWidget };
