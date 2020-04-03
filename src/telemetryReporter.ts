/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2020 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

(process.env['APPLICATION_INSIGHTS_NO_DIAGNOSTIC_CHANNEL'] as any) = true;

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as appInsights from 'applicationinsights';
import { VSCODE_JAVA_EXTENSION_ID } from './java';

export default class TelemetryReporter {
  private appInsightsClient: appInsights.TelemetryClient | undefined;
  private userOptIn = false;
  private readonly configListener: vscode.Disposable;

  private static readonly TELEMETRY_CONFIG_ID = 'telemetry';
  private static readonly TELEMETRY_CONFIG_ENABLED_ID = 'enableTelemetry';

  private readonly logStream: fs.WriteStream | undefined;

  // tslint:disable-next-line
  constructor(private readonly extensionId: string, private readonly extensionVersion: string, key: string) {
    let logFilePath = process.env['VSCODE_LOGS'] || '';
    if (logFilePath && extensionId && process.env['VSCODE_LOG_LEVEL'] === 'trace') {
      logFilePath = path.join(logFilePath, `${extensionId}.txt`);
      this.logStream = fs.createWriteStream(logFilePath, { flags: 'a', encoding: 'utf8', autoClose: true });
    }
    this.updateUserOptIn(key);
    this.configListener = vscode.workspace.onDidChangeConfiguration(() => this.updateUserOptIn(key));
  }

  private updateUserOptIn(key: string): void {
    const config = vscode.workspace.getConfiguration(TelemetryReporter.TELEMETRY_CONFIG_ID);
    if (this.userOptIn !== config.get<boolean>(TelemetryReporter.TELEMETRY_CONFIG_ENABLED_ID, true)) {
      this.userOptIn = config.get<boolean>(TelemetryReporter.TELEMETRY_CONFIG_ENABLED_ID, true);
      if (this.userOptIn) {
        this.createAppInsightsClient(key);
      } else {
        this.dispose();
      }
    }
  }

  private createAppInsightsClient(key: string) {
    //check if another instance is already initialized
    if (appInsights.defaultClient) {
      this.appInsightsClient = new appInsights.TelemetryClient(key);
      // no other way to enable offline mode
      this.appInsightsClient.channel.setUseDiskRetryCaching(true);
    } else {
      appInsights
        .setup(key)
        .setAutoCollectRequests(false)
        .setAutoCollectPerformance(false)
        .setAutoCollectExceptions(false)
        .setAutoCollectDependencies(false)
        .setAutoDependencyCorrelation(false)
        .setAutoCollectConsole(false)
        .setUseDiskRetryCaching(true)
        .start();
      this.appInsightsClient = appInsights.defaultClient;
    }

    this.appInsightsClient.commonProperties = this.getCommonProperties();
    if (vscode && vscode.env) {
      this.appInsightsClient.context.tags[this.appInsightsClient.context.keys.userId] = vscode.env.machineId;
      this.appInsightsClient.context.tags[this.appInsightsClient.context.keys.sessionId] = vscode.env.sessionId;
      this.appInsightsClient.context.tags[
        this.appInsightsClient.context.keys.applicationVersion
      ] = this.extensionVersion;
      this.appInsightsClient.context.tags[this.appInsightsClient.context.keys.deviceLocale] = vscode.env.language;
    }
  }

  private getCommonProperties(): { [key: string]: string } {
    const commonProperties = Object.create(null);
    if (vscode && vscode.env) {
      commonProperties['vscodeversion'] = vscode.version;
      commonProperties['vscodejavaversion'] = vscode.extensions.getExtension(
        VSCODE_JAVA_EXTENSION_ID
      )?.packageJSON.version;
    }
    return commonProperties;
  }

  public sendTelemetryEvent(
    eventName: string,
    properties?: { [key: string]: string },
    measurements?: { [key: string]: number }
  ): void {
    if (this.userOptIn && eventName && this.appInsightsClient) {
      this.appInsightsClient.trackEvent({
        name: `${this.extensionId}/${eventName}`,
        properties: properties,
        measurements: measurements
      });

      if (this.logStream) {
        this.logStream.write(`telemetry/${eventName} ${JSON.stringify({ properties, measurements })}\n`);
      }
    }
  }

  public sendTelemetryMetric(
    metricName: string,
    value: number,
    properties?: { [key: string]: string },
    count?: number,
    min?: number,
    max?: number,
    stdDev?: number
  ): void {
    if (this.userOptIn && metricName && this.appInsightsClient) {
      this.appInsightsClient.trackMetric({
        name: `${this.extensionId}/${metricName}`,
        value: value,
        properties: properties,
        count: count,
        min: min,
        max: max,
        stdDev: stdDev
      });

      if (this.logStream) {
        this.logStream.write(
          `telemetry/${metricName} ${value} ${JSON.stringify({ properties, count, min, max, stdDev })}\n`
        );
      }
    }
  }

  public sendTelemetryException(
    error: Error,
    properties?: { [key: string]: string },
    measurements?: { [key: string]: number }
  ): void {
    if (this.userOptIn && error && this.appInsightsClient) {
      this.appInsightsClient.trackException({
        exception: error,
        properties: properties,
        measurements: measurements
      });

      if (this.logStream) {
        this.logStream.write(
          `telemetry/${error.name} ${error.message} ${JSON.stringify({ properties, measurements })}\n`
        );
      }
    }
  }

  public dispose(): Promise<any> {
    this.configListener.dispose();

    const flushEventsToLogger = new Promise<any>(resolve => {
      if (!this.logStream) {
        return resolve(void 0);
      }
      this.logStream.on('finish', resolve);
      this.logStream.end();
    });

    const flushEventsToAI = new Promise<any>(resolve => {
      if (this.appInsightsClient) {
        this.appInsightsClient.flush({
          callback: () => {
            // all data flushed
            this.appInsightsClient = undefined;
            resolve(void 0);
          }
        });
      } else {
        resolve(void 0);
      }
    });
    return Promise.all([flushEventsToAI, flushEventsToLogger]);
  }
}
