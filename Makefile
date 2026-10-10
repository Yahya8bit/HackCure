# Tests run inside the api image, so no local Python setup is needed.
RUN = docker compose run --rm --no-deps --user $(shell id -u):$(shell id -g) -v ./backend:/app -v ./data:/data -v ./config:/config -v ./frontend/src/shared:/shared:ro -e NAWBA_RULES=/config/clinical_rules.yaml -e DEMO_PASSWORD=demo1234 -e HOME=/tmp api

.PHONY: test shell
test:
	$(RUN) python -m pytest -q -p no:cacheprovider

shell:
	$(RUN) bash
