import { AlertCircle } from "lucide-react";

interface Props {
  message: string | null;
}

export function ErrorBanner({ message }: Props) {
  if (!message) return null;
  return (
    <div className="bg-red-100 text-red-700 px-4 py-2 text-sm flex items-center">
      <AlertCircle className="w-4 h-4 mr-2" />
      {message}
    </div>
  );
}
