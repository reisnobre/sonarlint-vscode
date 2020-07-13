/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2020 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as Path from 'path';
import * as VSCode from 'vscode';
import { ShowRuleDescriptionParams } from './protocol';

/*
 * Utility class to load "external" resources from extension folder.
 * See Content-Security-Policy header in HTML.
 */
class ResourceResolver {
  constructor(private readonly context: VSCode.ExtensionContext, private readonly webview: VSCode.Webview) {}

  resolve(...segments: Array<string>) {
    return this.webview.asWebviewUri(VSCode.Uri.file(Path.join(this.context.extensionPath.toString(), ...segments)))
      .toString();
  }
}

export function computeRuleDescPanelContent(
    context: VSCode.ExtensionContext, webview: VSCode.Webview, rule: ShowRuleDescriptionParams
  ) {
  const resolver = new ResourceResolver(context, webview);
  const styleSrc = resolver.resolve('styles', 'rule.css');
  const severityImgSrc = resolver.resolve('images', 'severity', `${rule.severity.toLowerCase()}.png`);
  const typeImgSrc = resolver.resolve('images', 'type', `${rule.type.toLowerCase()}.png`);

  const ruleParamsHtml = renderRuleParams(rule);

  return `<!DOCTYPE html><html>
    <head>
    <meta http-equiv="Content-Type" content="text/html;charset=utf-8" />
    <meta http-equiv="Encoding" content="utf-8" />
    <meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}"/>
    <link rel="stylesheet" type="text/css" href="${styleSrc}" />
    </head>
    <body><h1><big>${escapeHtml(rule.name)}</big> (${rule.key})</h1>
    <div>
    <img class="type" alt="${rule.type}" src="${typeImgSrc}" />&nbsp;
    ${clean(rule.type)}&nbsp;
    <img class="severity" alt="${rule.severity}" src="${severityImgSrc}" />&nbsp;
    ${clean(rule.severity)}
    </div>
    <div class="rule-desc">${rule.htmlDescription}</div>
    ${ruleParamsHtml}
    </body></html>`;
}

const entityMap = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;'
};

function escapeHtml(str: string) {
  return String(str).replace(/[&<>""`=\/]/g, function(s) {
    return entityMap[s];
  });
}

function clean(str: string) {
  return capitalizeName(
    str
      .toLowerCase()
      .split('_')
      .join(' ')
  );
}

function capitalizeName(name: string) {
  return name.replace(/\b(\w)/g, s => s.toUpperCase());
}

function renderRuleParams(rule: ShowRuleDescriptionParams) {
  if (rule.parameters && rule.parameters.length > 0) {
    const ruleParamsConfig = VSCode.workspace.getConfiguration(`sonarlint.rules.${rule.key}.parameters`);
    return `<table class="rule-params">
  <caption>Parameters</caption>
  <tbody>
    ${rule.parameters.map(p => renderRuleParam(p, ruleParamsConfig)).join('\n')}
  </tbody>
</table>
<i>
  Parameter values are set in the <code>sonarlint.rules['${rule.key}'].parameters</code> property in user settings.
  In connected mode, values from the server will override local user settings.
</i>`;
  } else {
    return '';
  }
}

function renderRuleParam(param, config) {
  const { name, description, defaultValue } = param;
  const descriptionP = description ? `<p>${description}</p>` : '';
  const currentValue = config.has(name) ? `<small>Current value: <code>${config.get(name)}</code></small>` : '';
  return `<tr>
  <th>${name}</th>
  <td>
    ${descriptionP}
    ${currentValue}
    <small>(Default value: <code>${defaultValue}</code>)</small>
  </td>
</tr>`;
}
