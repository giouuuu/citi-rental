/**
 * Closes route modals on soft navigation. A parallel slot keeps rendering its
 * last match when the new URL has no match in the slot, so leaving
 * `(.)login` for `/register`, `/forgot-password`, or the post-login redirect
 * would otherwise leave the modal open over the new page.
 */
export default function ModalCatchAll() {
  return null;
}
