# Shortcuts for Linux/macOS (or Windows with WSL / Git Bash + make).
# Windows PowerShell users: use the plain commands in README.md instead.

IMAGE   ?= nextjs-devops:local
NS      ?= devops-demo

.PHONY: dev build image cluster load deploy status url logs scale crash update rollback clean

dev:            ## run locally without Docker or Kubernetes
	cd app && npm install && npm run dev

image:          ## build the Docker image
	docker build -t $(IMAGE) --build-arg GIT_SHA=local --build-arg BUILD_TIME=$$(date -u +%FT%TZ) app

cluster:        ## start minikube
	minikube start --cpus=2 --memory=3072

load:           ## copy the local image into minikube
	minikube image load $(IMAGE)

deploy:         ## apply all manifests
	kubectl apply -k k8s
	kubectl -n $(NS) rollout status deploy/nextjs-devops

status:         ## show pods and service
	kubectl -n $(NS) get pods,svc,deploy -o wide

url:            ## open the app in the browser
	minikube service nextjs-devops -n $(NS)

logs:           ## follow logs of all pods
	kubectl -n $(NS) logs -l app.kubernetes.io/name=nextjs-devops -f --prefix

scale:          ## usage: make scale N=5
	kubectl -n $(NS) scale deploy/nextjs-devops --replicas=$(N)

crash:          ## delete a pod by hand and watch it come back
	kubectl -n $(NS) delete pod $$(kubectl -n $(NS) get pods -o name | head -1)
	kubectl -n $(NS) get pods -w

update:         ## usage: make update V=v2  (build, load, rolling update)
	docker build -t nextjs-devops:$(V) --build-arg APP_VERSION=$(V) --build-arg GIT_SHA=$(V) app
	minikube image load nextjs-devops:$(V)
	kubectl -n $(NS) set image deploy/nextjs-devops web=nextjs-devops:$(V)
	kubectl -n $(NS) rollout status deploy/nextjs-devops

rollback:       ## undo the last rollout
	kubectl -n $(NS) rollout undo deploy/nextjs-devops
	kubectl -n $(NS) rollout status deploy/nextjs-devops

clean:          ## delete everything
	kubectl delete -k k8s --ignore-not-found
