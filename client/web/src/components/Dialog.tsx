import React, { useEffect, useRef } from 'react';

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

const Dialog: React.FC<DialogProps> = ({ isOpen, onClose, title, children, className = '' }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) {
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className={`dialog ${className}`}
      onClick={handleBackdropClick}
      onClose={onClose}
    >
      <div className="dialog-content">
        <div className="dialog-header">
          <h2 className="dialog-title">{title}</h2>
          <button className="dialog-close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="dialog-body">{children}</div>
      </div>
    </dialog>
  );
};

export default Dialog;
