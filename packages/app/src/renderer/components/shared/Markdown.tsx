import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ content }: { content: string }) {
  return (
    <div className="text-sm text-on-surface space-y-2 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-on-surface [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-on-surface [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-on-surface [&_strong]:font-semibold [&_strong]:text-on-surface [&_a]:text-blue-400 [&_a]:underline hover:[&_a]:text-blue-300 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_code]:rounded [&_code]:bg-surface-active [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs [&_code]:font-mono [&_pre]:rounded-md [&_pre]:bg-surface-elevated [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_blockquote]:border-l-2 [&_blockquote]:border-border-hover [&_blockquote]:pl-3 [&_blockquote]:text-on-surface-secondary [&_table]:w-full [&_table]:border-collapse [&_table]:text-left [&_table]:text-xs [&_th]:border [&_th]:border-border [&_th]:bg-surface-elevated [&_th]:px-3 [&_th]:py-1.5 [&_th]:font-medium [&_th]:text-on-surface [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1.5">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
