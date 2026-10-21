import Foundation

/// The account's workspace as `/api/workspace` answers and saves it (src/plugins/storage/cloud/client.ts): the
/// document, and the revision a save must name so that it does not overwrite a change made elsewhere since.
public struct AccountWorkspace: Equatable, Sendable {
  public var accountId: String
  public var revision: Int
  public var document: WorkspaceDocument

  public init(accountId: String, revision: Int, document: WorkspaceDocument) {
    self.accountId = accountId
    self.revision = revision
    self.document = document
  }
}

private struct AccountWorkspaceBody: Codable {
  var lists: [WordList]
  var devices: [PracticeDevice]?
  var revision: Int
  var accountId: String
}

/// Reads an answer of `/api/workspace`. An account that has saved nothing (revision 0) shows the starting lists, as in
/// the web app, and the first save keeps them.
public func decodeAccountWorkspace(_ data: Data) throws -> AccountWorkspace {
  let body: AccountWorkspaceBody
  do { body = try JSONDecoder().decode(AccountWorkspaceBody.self, from: data) } catch { throw TypleError("invalidServerData") }
  guard body.revision >= 0, !body.accountId.isEmpty else { throw TypleError("invalidServerData") }
  try validateLists(body.lists)
  let lists = body.revision == 0 ? initialLists() : body.lists
  return AccountWorkspace(accountId: body.accountId, revision: body.revision,
                          document: WorkspaceDocument(lists: lists, devices: try decodeDevices(body.devices ?? [])))
}

/// The body of a save (`PUT /api/workspace`): the whole document, for the revision it was changed from.
public func encodeAccountWorkspace(_ workspace: AccountWorkspace) throws -> Data {
  try validateLists(workspace.document.lists)
  _ = try decodeDevices(workspace.document.devices)
  let encoder = JSONEncoder()
  encoder.outputFormatting = [.withoutEscapingSlashes]
  let data = try encoder.encode(AccountWorkspaceBody(lists: workspace.document.lists, devices: workspace.document.devices,
                                                     revision: workspace.revision, accountId: workspace.accountId))
  // The server reads at most 1 MiB.
  if data.count > maxWorkspaceBytes { throw TypleError("workspaceTooLarge") }
  return data
}
