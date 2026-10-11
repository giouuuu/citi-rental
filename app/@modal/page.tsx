/**
 * Closes route modals on a soft navigation to "/". `[...catchAll]` needs at
 * least one segment, so without this the `(.)login` modal stayed open over
 * the home page after signing in.
 */
export default function ModalHome() {
  return null;
}
