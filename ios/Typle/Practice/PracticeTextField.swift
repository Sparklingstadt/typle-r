import SwiftUI
import UIKit

/// The practice input. Text being composed by an input method (romaji, pinyin) is shown but never judged: only text
/// committed with no marked range reaches `onCommit`, like compositionstart/compositionend in the web app.
struct PracticeTextField: UIViewRepresentable {
  /// The judged input; the field is set to it whenever nothing is being composed.
  var text: String
  var placeholder: String
  var invalid: Bool
  /// Changing this number focuses the field.
  var focusRequest: Int
  var onCommit: (String) -> Void
  var onComposingChange: (Bool) -> Void
  var onFocusChange: (Bool) -> Void
  var onEscape: () -> Void

  func makeCoordinator() -> Coordinator { Coordinator(self) }

  func makeUIView(context: Context) -> PracticeUITextField {
    let field = PracticeUITextField()
    field.delegate = context.coordinator
    field.addTarget(context.coordinator, action: #selector(Coordinator.changed(_:)), for: .editingChanged)
    field.autocorrectionType = .no
    field.autocapitalizationType = .none
    field.spellCheckingType = .no
    field.smartQuotesType = .no
    field.smartDashesType = .no
    field.smartInsertDeleteType = .no
    field.inlinePredictionType = .no
    field.textContentType = nil
    field.returnKeyType = .default
    field.textAlignment = .center
    field.font = .systemFont(ofSize: 24, weight: .regular)
    field.borderStyle = .none
    field.layer.cornerRadius = 10
    field.layer.borderWidth = 2
    field.backgroundColor = .secondarySystemBackground
    field.accessibilityIdentifier = "practiceInput"
    field.setContentHuggingPriority(.defaultLow, for: .horizontal)
    return field
  }

  func updateUIView(_ field: PracticeUITextField, context: Context) {
    context.coordinator.parent = self
    field.placeholder = placeholder
    field.accessibilityLabel = placeholder
    field.layer.borderColor = (invalid ? UIColor.systemRed : UIColor.tintColor).cgColor
    field.onEscape = { [weak field] in
      guard field?.markedTextRange == nil else { return }
      context.coordinator.parent.onEscape()
    }
    // Replacing the text while something is being composed would cancel the composition.
    if field.markedTextRange == nil && field.text != text { field.text = text }
    if context.coordinator.focusRequest != focusRequest {
      context.coordinator.focusRequest = focusRequest
      DispatchQueue.main.async { field.becomeFirstResponder() }
    }
  }

  final class Coordinator: NSObject, UITextFieldDelegate {
    var parent: PracticeTextField
    var focusRequest: Int
    private var composing = false

    init(_ parent: PracticeTextField) {
      self.parent = parent
      focusRequest = parent.focusRequest - 1
    }

    @objc func changed(_ field: UITextField) {
      let isComposing = field.markedTextRange != nil
      if isComposing != composing {
        composing = isComposing
        parent.onComposingChange(isComposing)
      }
      if !isComposing { parent.onCommit(field.text ?? "") }
    }

    func textFieldDidBeginEditing(_ textField: UITextField) { parent.onFocusChange(true) }
    func textFieldDidEndEditing(_ textField: UITextField) { parent.onFocusChange(false) }
    /// Return does nothing; words advance when they are typed correctly.
    func textFieldShouldReturn(_ textField: UITextField) -> Bool { false }
  }
}

/// A text field that cannot be pasted or dropped into, and that hands Esc on a hardware keyboard to the practice.
final class PracticeUITextField: UITextField, UITextDropDelegate {
  var onEscape: (() -> Void)?

  override init(frame: CGRect) {
    super.init(frame: frame)
    // Dropped text would count as typed.
    textDropDelegate = self
    pasteConfiguration = nil
  }

  func textDroppableView(_ textDroppableView: UIView & UITextDroppable, proposalForDrop drop: UITextDropRequest) -> UITextDropProposal {
    UITextDropProposal(operation: .forbidden)
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

  override var keyCommands: [UIKeyCommand]? {
    [UIKeyCommand(input: UIKeyCommand.inputEscape, modifierFlags: [], action: #selector(escape))]
  }

  @objc private func escape() { onEscape?() }

  override func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool {
    if action == #selector(paste(_:)) || action == #selector(UIResponderStandardEditActions.pasteAndMatchStyle(_:)) { return false }
    return super.canPerformAction(action, withSender: sender)
  }

  override func paste(_ sender: Any?) {}

  override func textRect(forBounds bounds: CGRect) -> CGRect { bounds.insetBy(dx: 12, dy: 0) }
  override func editingRect(forBounds bounds: CGRect) -> CGRect { bounds.insetBy(dx: 12, dy: 0) }
  override func placeholderRect(forBounds bounds: CGRect) -> CGRect { bounds.insetBy(dx: 12, dy: 0) }
}
