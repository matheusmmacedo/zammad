# KLaOS Helpdesk — Zammad image with our .zpm packages staged
# for auto-install on the init container. All the Zammad service
# variants (init, railsserver, websocket, scheduler, nginx) can run
# off this same image — only zammad-init actually consumes the
# /opt/zammad/auto_install/ contents.

ARG ZAMMAD_VERSION=7.0.1-0006
FROM ghcr.io/zammad/zammad:${ZAMMAD_VERSION}

USER root
RUN mkdir -p /opt/zammad/auto_install && chown -R 1000:1000 /opt/zammad/auto_install

COPY --chown=1000:1000 packages/build/*.zpm /opt/zammad/auto_install/
COPY --chown=1000:1000 --chmod=755 scripts/klaos-init.sh /opt/zammad/bin/klaos-init

USER 1000:1000
ENTRYPOINT ["/opt/zammad/bin/klaos-init"]
