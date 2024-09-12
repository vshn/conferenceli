#!/bin/bash

# Check all nodes and find the ones that are NotReady
get_not_ready_nodes() {
    kubectl get nodes --no-headers | awk '$2 == "NotReady" {print $1}'
}

# Get all pods running on a given node
get_pods_on_node() {
    local node_name="$1"
    kubectl get pods --all-namespaces --field-selector spec.nodeName="$node_name" --no-headers -o custom-columns="NAMESPACE:.metadata.namespace,NAME:.metadata.name"
}

# Force delete a pod in a given namespace
force_delete_pod() {
    local namespace="$1"
    local pod_name="$2"
    kubectl delete pod "$pod_name" --namespace "$namespace" --grace-period=0 --force
}

# Main logic: check for NotReady nodes and delete the pods running on them
not_ready_nodes=$(get_not_ready_nodes)

if [[ -z "$not_ready_nodes" ]]; then
    echo "All nodes are in Ready state."
    return
fi

for node in $not_ready_nodes; do
    echo "Node $node is NotReady."
    
    pods=$(get_pods_on_node "$node")
    if [[ -z "$pods" ]]; then
        echo "No pods found on node $node."
        continue
    fi

    # Loop through each pod and force delete it
    echo "$pods" | while read -r pod; do
        namespace=$(echo "$pod" | awk '{print $1}')
        pod_name=$(echo "$pod" | awk '{print $2}')
        echo "Force deleting pod $pod_name in namespace $namespace on node $node."
        force_delete_pod "$namespace" "$pod_name"
    done
done

