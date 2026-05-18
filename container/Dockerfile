FROM cloakhq/cloakbrowser:0.3.28

WORKDIR /srv
COPY server.py .

EXPOSE 8000

# The base image entrypoint launches Xvfb for headed mode; we run headless.
ENTRYPOINT []
CMD ["python", "/srv/server.py"]
