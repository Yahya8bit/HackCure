# Tests run inside the api image, so no local Python setup is needed.
RUN = docker compose run --rm --no-deps -v ./backend:/app -e DEMO_PASSWORD=demo1234 api

.PHONY: test shell
test:
	$(RUN) python -m pytest -q -p no:cacheprovider

shell:
	$(RUN) bash
