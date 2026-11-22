import type { ReactNode } from 'react';

export const Icon = ({ name, className = 'icon' }: { name: string; className?: string }) => (
    <svg className={className} aria-hidden="true">
        <use href={`#i-${name}`} />
    </svg>
);

export const Card = ({ children, className = '', style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) => (
    <div className={`card ${className}`} style={style}>
        {children}
    </div>
);

export const CardHead = ({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) => (
    <div className="card-head">
        <div>
            <h3>{title}</h3>
            {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {action}
    </div>
);

export const Button = ({
    children,
    onClick,
    variant = '',
    size = '',
    disabled,
    title,
    type = 'button',
}: {
    children: ReactNode;
    onClick?: () => void;
    variant?: '' | 'primary' | 'ghost' | 'danger';
    size?: '' | 'sm';
    disabled?: boolean;
    title?: string;
    type?: 'button' | 'submit';
}) => (
    <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        title={title}
        className={`btn ${variant} ${size}`.trim()}
    >
        {children}
    </button>
);

export const IconButton = ({ icon, onClick, title }: { icon: string; onClick: () => void; title?: string }) => (
    <button type="button" className="icon-btn" onClick={onClick} title={title} aria-label={title}>
        <Icon name={icon} />
    </button>
);

export const Field = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
    <label className="field">
        <span>{label}</span>
        {children}
        {hint ? <span className="hint">{hint}</span> : null}
    </label>
);

export const Empty = ({ message }: { message: string }) => (
    <div className="list-empty">
        <Icon name="inbox" />
        <div>{message}</div>
    </div>
);

export const Skeleton = ({ width, height = 12 }: { width: string; height?: number }) => (
    <div className="skeleton" style={{ width, height }} />
);

export const SkeletonPage = () => (
    <>
        <div className="grid kpis">
            {[0, 1, 2, 3].map(index => (
                <div key={index} className="card kpi">
                    <Skeleton width="60%" />
                    <Skeleton width="45%" height={22} />
                    <Skeleton width="35%" />
                </div>
            ))}
        </div>
        <div className="grid two-col" style={{ marginTop: 16 }}>
            <div className="card" style={{ height: 280, display: 'grid', placeItems: 'center' }}>
                <Skeleton width="80%" height={200} />
            </div>
            <div className="card" style={{ height: 280, display: 'grid', placeItems: 'center' }}>
                <Skeleton width="60%" height={200} />
            </div>
        </div>
    </>
);

export const Modal = ({
    title,
    subtitle,
    wide,
    onClose,
    children,
    footer,
}: {
    title: string;
    subtitle?: string;
    wide?: boolean;
    onClose: () => void;
    children: ReactNode;
    footer?: ReactNode;
}) => (
    <div
        className="modal-backdrop"
        onClick={event => {
            if (event.target === event.currentTarget) onClose();
        }}
    >
        <div className={`modal ${wide ? 'wide' : ''}`.trim()} role="dialog" aria-modal="true" aria-label={title}>
            <div className="modal-head">
                <div>
                    <h2>{title}</h2>
                    {subtitle ? <p>{subtitle}</p> : null}
                </div>
                <IconButton icon="x" onClick={onClose} title="Close" />
            </div>
            <div className="modal-body">{children}</div>
            {footer ? <div className="modal-foot">{footer}</div> : null}
        </div>
    </div>
);

export const Money = ({ value, currency, tone = '' }: { value: string; currency?: string; tone?: '' | 'pos' | 'neg' }) => (
    <span className={`t-num ${tone}`.trim()} title={currency}>
        {value}
    </span>
);
