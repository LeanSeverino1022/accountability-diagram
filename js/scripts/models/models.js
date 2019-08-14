

function Node(data) {

    var self = this;
    data = data || {};    
    
    self.name = ko.observable(data.name || "Node");     
}
