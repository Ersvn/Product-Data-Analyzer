export function EmptyState({
                               title = 'Nothing found',
                               description = 'Try adjusting your filters or search.',
                               icon = '📭',
                               action
                           }) {
    return (
        <div className="empty-state">
            <div className="empty-state__icon">{icon}</div>
            <h3 className="empty-state__title">{title}</h3>
            <p className="empty-state__desc">{description}</p>
            {action && <div className="empty-state__action">{action}</div>}
        </div>
    );
}