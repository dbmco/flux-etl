# Entrypoint

- Utilize entrypoint; Each container has a specific responsibility.
- Focus on single responsibility principle; Design with modularity, scaling, testing, and maintenance in mind.

# Dockerfile
```
FROM rancher/alpine-git:1.0.4
ENTRYPOINT "/bin/bash"
```

Example A

```
COPY entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["entrypoint.sh"]
```

Example B

```
ENTRYPOINT ["python", "app.py"]
```

Results in Verbose Output (Helpful for debugging)

```
docker run <image> --version
python app.py --version
```

- Utilize environment variables
`./app -f "${VAR}"`

[Sample entrypoint](https://github.com/docker-library/docker/blob/master/docker-entrypoint.sh\)

* Verify SSH/TLS certs
* Do not run stale images
