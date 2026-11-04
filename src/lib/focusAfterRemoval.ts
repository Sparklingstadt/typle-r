// After a removal, focus the item that took the removed item's place so the next one can be handled too, or the heading when none is left.
export function focusAfterRemoval(event: Event, selector: string, position: number, removed: boolean) {
  event.preventDefault()
  const buttons = document.querySelectorAll<HTMLElement>(selector)
  const target = removed ? buttons[Math.min(position, buttons.length - 1)] : buttons[position]
  if (target) target.focus()
  else document.getElementById('list-heading')?.focus()
}
