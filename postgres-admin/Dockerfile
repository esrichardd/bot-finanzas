FROM haproxy:3.2.22-alpine

COPY --chown=haproxy:haproxy --chmod=0444 haproxy.cfg /usr/local/etc/haproxy/haproxy.cfg

RUN haproxy -c -f /usr/local/etc/haproxy/haproxy.cfg
