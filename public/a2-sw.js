self.addEventListener(
  'push',
  (event) => {
    let data = {};

    try {
      if (event.data) {
        data =
          event.data.json();
      }
    } catch {
      data = {
        body:
          event.data
            ? event.data.text()
            : '',
      };
    }

    const title =
      data.title ||
      'A2';

    const options = {
      body:
        data.body ||
        'A2 has something for you.',

      tag:
        data.tag ||
        undefined,

      renotify:
        false,

      data: {
        url:
          data.url ||
          '/notifications',

        notification_id:
          data.notification_id ||
          null,
      },
    };

    event.waitUntil(
      self.registration
        .showNotification(
          title,
          options
        )
    );
  }
);

self.addEventListener(
  'notificationclick',
  (event) => {
    event.notification.close();

    const targetUrl =
      event.notification
        ?.data
        ?.url ||
      '/notifications';

    event.waitUntil(
      clients
        .matchAll({
          type:
            'window',

          includeUncontrolled:
            true,
        })
        .then(
          (windowClients) => {
            for (
              const client of
              windowClients
            ) {
              if (
                'focus' in
                client
              ) {
                try {
                  client.navigate(
                    targetUrl
                  );
                } catch {
                  // Ignore navigation failure.
                }

                return client.focus();
              }
            }

            if (
              clients.openWindow
            ) {
              return clients
                .openWindow(
                  targetUrl
                );
            }

            return undefined;
          }
        )
    );
  }
);