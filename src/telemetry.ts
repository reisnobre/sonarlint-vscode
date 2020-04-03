/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2020 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as util from './util';
import TelemetryReporter from './telemetryReporter';
import { ExtensionContext } from 'vscode';

export type Properties = { [key: string]: string };
export type Measures = { [key: string]: number };

export enum Event {
  LsStarted = 'languageServerStarted',
  LsStopped = 'languageServerStopped',
  ShowRuleDescription = 'showRuleDescription',
  JreResolved = 'jreResolved',
  InstallManagedJre = 'installManagedJre'
}

interface IPackageInfo {
  name: string;
  version: string;
  aiKey: string;
}

enum ServerEventType {
  Event = 0,
  Error = 1,
  Metric = 2
}

interface ServerEvent {
  type: ServerEventType;
  eventName?: string;
  properties?: Properties;
  measures?: Measures;
  stack?: string;
  metricName?: string;
  metricValue?: number;
}

let telemetryReporter: TelemetryReporter | null;

export function activate(context: ExtensionContext): void {
  try {
    telemetryReporter = createReporter();
    context.subscriptions.push(telemetryReporter);
  } catch (e) {
    // can't really do much about this
  }
}

export function deactivate(): void {
  if (telemetryReporter) {
    telemetryReporter.dispose();
  }
}

export function logEvent(eventName: Event, properties?: Properties, measures?: Measures): void {
  if (telemetryReporter) {
    telemetryReporter.sendTelemetryEvent(eventName, properties, measures);
  }
}

export function logServerEvent(e: ServerEvent): void {
  if (!telemetryReporter) {
    return;
  }
  switch (e.type) {
    case ServerEventType.Event:
      telemetryReporter.sendTelemetryEvent(e.eventName, e.properties, e.measures);
      break;
    case ServerEventType.Error:
      telemetryReporter.sendTelemetryException({ stack: e.stack } as Error, e.properties, e.measures);
      break;
    case ServerEventType.Metric:
      telemetryReporter.sendTelemetryMetric(e.metricName, e.metricValue, e.properties);
      break;
  }
}

export function logError(error: Error, properties?: Properties, measures?: Measures): void {
  if (telemetryReporter) {
    telemetryReporter.sendTelemetryException(error, properties, measures);
  }
}

export function durationKey(e: Event): string {
  return `${e}Duration`;
}

function createReporter(): TelemetryReporter | null {
  const packageInfo: IPackageInfo = getPackageInfo();
  if (packageInfo && packageInfo.aiKey) {
    return new TelemetryReporter(packageInfo.name, packageInfo.version, packageInfo.aiKey);
  }
  return null;
}

function getPackageInfo(): IPackageInfo {
  return {
    name: 'sonarlint-vscode',
    version: util.packageJson.version,
    aiKey: '794e9b7c-e93a-48bb-b57a-7feef88ca527'
  };
}
