/** The Kestro application wordmark: always lowercase text, never an image or the firm's name. */
export function Wordmark({ className = "", inverse = false }: { className?: string; inverse?: boolean }) {
  return <span className={`wordmark ${inverse ? "text-white" : "text-text"} ${className}`}>kestro</span>;
}
