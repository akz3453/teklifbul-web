declare const toast: {
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
  warn: (msg: string) => void;
};

export { toast };