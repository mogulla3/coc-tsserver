/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { workspace, CodeActionProvider, CodeActionProviderMetadata } from 'coc.nvim'
import { CancellationToken, Range, CodeActionContext, WorkspaceEdit, CodeActionKind, CodeAction } from 'vscode-languageserver-protocol'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { Command } from './commands'
import Proto from './protocol'
import { standardLanguageDescriptions } from './utils/languageDescription'
import * as typeconverts from './utils/typeConverters'
import FileConfigurationManager from './features/fileConfigurationManager'
import TypeScriptServiceClient from './typescriptServiceClient'
import TsserverService from '../server'

export class OrganizeImportsCommand implements Command {
  public readonly id: string = 'tsserver.organizeImports'

  constructor(
    private readonly service: TsserverService
  ) {
  }

  private async getTextEdits(client: TypeScriptServiceClient, document: TextDocument): Promise<WorkspaceEdit | null> {
    let file = client.toPath(document.uri)
    const args: Proto.OrganizeImportsRequestArgs = {
      scope: {
        type: 'file',
        args: {
          file
        }
      }
    }
    const response = await client.interruptGetErr(() => client.execute('organizeImports', args, CancellationToken.None))
    if (!response || response.type != 'response' || !response.success) {
      return
    }

    const edit = typeconverts.WorkspaceEdit.fromFileCodeEdits(
      client,
      response.body
    )
    let desc = standardLanguageDescriptions.find(o => o.modeIds.indexOf(document.languageId) !== -1)
    if (!desc) return null
    return edit
  }

  public async execute(document?: TextDocument): Promise<void> {
    let client = await this.service.getClientHost()
    if (!document) {
      let doc = await workspace.document
      if (!doc.attached) {
        throw new Error(`Document not attached.`)
      }
      if (client.serviceClient.modeIds.indexOf(doc.filetype) == -1) {
        throw new Error(`filetype "${doc.filetype}" not supported by tsserver.`)
      }
      document = doc.textDocument
    }
    let edit = await this.getTextEdits(client.serviceClient, document)
    if (edit) await workspace.applyEdit(edit)
    return
  }
}

export class OrganizeImportsCodeActionProvider implements CodeActionProvider {
  // public static readonly minVersion = API.v280

  public constructor(
    private readonly client: TypeScriptServiceClient,
    private readonly fileConfigManager: FileConfigurationManager,
  ) {
  }

  public readonly metadata: CodeActionProviderMetadata = {
    providedCodeActionKinds: [CodeActionKind.SourceOrganizeImports]
  }

  public async provideCodeActions(
    document: TextDocument,
    _range: Range,
    context: CodeActionContext,
    token: CancellationToken
  ): Promise<CodeAction[]> {
    if (this.client.modeIds.indexOf(document.languageId) == -1) return

    if (!context.only || !context.only.includes(CodeActionKind.SourceOrganizeImports)) {
      return []
    }
    await this.fileConfigManager.ensureConfigurationForDocument(document, token)

    const action = CodeAction.create('Organize Imports', {
      title: '',
      command: 'tsserver.organizeImports',
      arguments: [document]
    }, CodeActionKind.SourceOrganizeImports)
    return [action]
  }
}
