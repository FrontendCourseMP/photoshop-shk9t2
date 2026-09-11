import { useEffect, useRef, type ReactNode } from 'react';

export type ModalProps = {
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  widthMax?: string;
};

export function Modal({ onClose, title, children, footer, className = '', widthMax = '560px' }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog ref={dialogRef} className={`modal-dialog ${className}`} style={{ maxWidth: widthMax }} onCancel={onClose}>
      <div className="modal-panel">
        {title ? (
          <header className="modal-header">
            <h2>{title}</h2>
          </header>
        ) : null}
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </div>
    </dialog>
  );
}
