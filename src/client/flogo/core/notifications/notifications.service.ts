import { Injectable } from '@angular/core';
import { BehaviorSubject, timer, Observable } from 'rxjs';
import { Router, NavigationEnd } from '@angular/router';
import { filter, take, takeUntil } from 'rxjs/operators';
import { Notification, NotificationMessage } from '@flogo/core/notifications/notifications';

const keepPersistableOnly = (notifications: Notification[]) => notifications.filter(n => n.persistAfterNavigation);
const DEFAULT_TIMEOUT = 4500;

@Injectable({
  providedIn: 'root'
})
export class NotificationsService {

  private notificationsSource = new BehaviorSubject([]);
  private routeChange$: Observable<any>;

  constructor(private router: Router) {
    this.routeChange$ = router.events
      .pipe(filter(event => event instanceof NavigationEnd));
    this.routeChange$
      .subscribe(() => this.onNavigationEnd());
  }

  get notifications$() {
    return this.notificationsSource.asObservable();
  }

  success(message: NotificationMessage, timeout = DEFAULT_TIMEOUT) {
    this.addNotification({ type: 'success', message }, timeout);
  }

  error(message: NotificationMessage, timeout = DEFAULT_TIMEOUT) {
    this.addNotification({ type: 'error', message }, timeout);
  }

  removeNotification(notification: Notification) {
    this.updateNotifications((current) => current.filter(n => n !== notification));
  }

  private addNotification(notification: Notification, timeout?: number) {
    this.updateNotifications((current: Notification[]) => [notification, ...current]);
    if (timeout) {
      this.waitAndRemove(notification, timeout);
    }
  }

  private waitAndRemove(notification: Notification, waitMs: number) {
    const operators = [take(1)];
    if (!notification.persistAfterNavigation) {
      // in case route changes before timeout, notification should be removed by route cleaner
      operators.push(takeUntil(this.getNextRouteChange()));
    }
    timer(waitMs)
      .pipe(...operators)
      .subscribe(() => this.removeNotification(notification));
  }

  private getNextRouteChange() {
    return this.routeChange$.pipe(take(1));
  }

  private onNavigationEnd() {
    this.updateNotifications(keepPersistableOnly);
  }

  private updateNotifications(update: (currentNotifications: Notification[]) => Notification[]) {
    const currentNotifications = this.notificationsSource.getValue();
    const nextNotifications = update(currentNotifications);
    if (nextNotifications !== currentNotifications) {
      this.notificationsSource.next(nextNotifications);
    }
  }

}
