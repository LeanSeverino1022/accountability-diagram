$j(document).ready(function () {

    viewModel.initMapData();

    // infoPopover.init();
    editNodePopover.init();
    menuItemsPopover.init();

    //set our root node vertically centered
    setRootNodePosition(currentMapOrientation);
    
});

/****************** 
    VIEWMODEL
******************/

//just rename this to what fits
function AppViewModel() {
    var self = this;

    self.mapData = ko.observable(null);

    self.initMapData = function(){       

        //or load from data object
        self.mapData(new Node(window.sourceData));   
    };

    // this currentContext is referring to object that is being chosen when using "w3mgui widget" or the active node when we show the item menu.
    self.currentContext = ko.observable(null);

    //subscribe to be notified of changes
    self.mapData.subscribe(function (newMapData) {     
        updateMap(self.mapData());
    });        
}

window.viewModel = new AppViewModel();
ko.applyBindings(viewModel);


/****************** 
    dataService
******************/
// dataService module - contains logic code for retrieving & saving data. The view model will just communicate with dataService api 
//usage: dataService.getMapData(function(data){ do something with data })

//notes:you can make this module common to multiple pages, just add to the existing api. just make sure all it does is retrieve and save data and the callback will be the one to handle what to do with the data. 
var dataService = (function () {

    var publicAPI = {
        getMapData,
    };

    function getMapData(callback) {
        if ($j.isFunction(callback)) {
            $j.getJSON('js/data/sourceData.json', function (data) {
                callback(data);
            })
                .fail(function (jqXHR, textStatus, errorThrown) {
                    console.error("getJSON request failed:" + errorThrown);
                });
        }
    };

    // postSomeData
    return publicAPI;
}());

/****************
 *  DENDROGRAM 
 *****************/

var mapOrientation = {
    LEFT_TO_RIGHT: 0,
    TOP_TO_BOTTOM: 1
};

// config
var nodeWidth = 180,
    nodeHeight = 60,
    nodeTextSize = '16px',
    parentChildGap = 60, /* parent child gap */
    siblingsGap = 20,
    scaleExtent = [0.3, 5], //used in zoom
    dummyId = 0,
    duration = 700,
    currentMapOrientation = mapOrientation.LEFT_TO_RIGHT;

//selectedNode can be removed and much better to use viewModel.currentContext;
//but if you want to keep it for some reason, always use setSelectedNode() to update a variable 
var selectedNode = null;
var setSelectedNode = function (data) { 
    selectedNode = data;
    viewModel.currentContext(data); 
};

setHeightMindmapContainer(); //make sure to call this before setitng zoom.translate and svg.attr(transform)

var zoom = d3.behavior
    .zoom()
    .scaleExtent(scaleExtent)
    .on('zoom', updateZoom);

var svg = d3
    .select('.mindmap-container')
    .append('svg')
    .attr('id', 'svg')
    .attr('width', $j('.mindmap-container').outerWidth(true) + 'px')
    .attr('height', $j('.mindmap-container').outerHeight(true) + 'px')
    .call(zoom)
    .append('g')
    .attr('id', 'gNodesContainer');

function updateMap(source) {
    //spacing between nodes
    var tree = d3.layout.tree()
        .nodeSize(getMapOrientation().nodeSize)
        .separation(function (a, b) { return (a.parent === b.parent ? 1 : 1.2); });

    //how to render links between nodes

    var diagonal = d3.svg.diagonal()
        .projection(function (d) { return getMapOrientation().diagonalProjection(d); })
        .source(function (d) { return { x: d.source.x, y: d.source.y }; })
        .target(function (d) {
            return { x: d.target.x, y: d.target.y - getMapOrientation().diagonalTargetOffset };
        });


    // Compute the new tree layout.
    var nodes = tree.nodes(viewModel.mapData()).reverse();
    var rootNode = nodes[nodes.length - 1]; /* or viewModel.mapData() in this case */

    //open popover on 1st updateMap call
    if (!updateMap.hasRunOnce) {
 
        setSelectedNode(rootNode); 
        updateMap.hasRunOnce = true;
    }

    var links = tree.links(nodes);

    // updateMap the nodes…

    var node = svg.selectAll("g.node")
        .data(nodes, function (d) { return d.nodeId || (d.nodeId = ++dummyId); });

    var nodeEnter = node.enter().append("g")
        .attr("class", "node")
        // .attr("transform", function (d) { return "translate(" + source.x + "," + source.y + ")"; });
        // .attr("transform", function (d) { return "translate(" + d.x + "," + d.y + ")"; });
        .attr("transform", function (d) { return getMapOrientation().gTransform(d); });

    nodeEnter.append("rect")
        .attr("height", nodeHeight)
        .attr("width", nodeWidth)
        // .attr("rx", 10)
        // .attr("ry", 10)
        .style("fill", setFill)
        .attr("class", 'nodeRect')
        .attr("transform", function (d) { return getMapOrientation().rectTransform(d); });
    // .attr("transform", function (d) { return "translate(" +(-nodeWidth)  + "," + (-nodeHeight / 2) + ")"; });


    nodeEnter.append("circle")
        .attr("r", 7)
        .on("click", function (d) {
            nodeClicked(d, this);
        });


    nodeEnter.append("text")
        .text(function (d) { return d.name(); })
        .style("fill-opacity", 1)
        .attr("text-anchor", "middle")
        .attr("x", getMapOrientation().textX)
        .attr("y", 0)
        .attr("class", "nodeText")
        .attr("font-size", nodeTextSize)
        .attr("width", nodeWidth - 35)
        .on("click", function(d) { 
            setSelectedNode(d);
            editNodePopover.show(d);    
        })
        .call(wrap)
        .attr("y", function (d) {
            // this is the svg text element   
            let offset = this.getBBox().height / 2 - 10;
            return getMapOrientation().textY - offset;
        });

    // operate on old and new text elements
    let nodeLabel = d3.selectAll(".nodeText");
    nodeLabel.text(function (d) { return d.name(); })
        .call(wrap)
        .attr("y", function (d) {
            // this is the svg text element   
            let offset = this.getBBox().height / 2 - 10;
            return getMapOrientation().textY - offset;
        });

    var nodeButtonsContainer = nodeEnter.append("g")
        .attr("class", "nodeButtons")
        .attr("transform", "translate( 10, -20 )")
        .style('fill', '#fff');

    //position the icon buttons relative to its nodeButtonsContainer
    //Node Action Icons - Add
    nodeButtonsContainer.append("path")
        .attr("d", "M12 24c-6.627 0-12-5.372-12-12s5.373-12 12-12c6.628 0 12 5.372 12 12s-5.372 12-12 12zM12 3c-4.97 0-9 4.030-9 9s4.030 9 9 9c4.971 0 9-4.030 9-9s-4.029-9-9-9zM13.5 18h-3v-4.5h-4.5v-3h4.5v-4.5h3v4.5h4.5v3h-4.5v4.5z")
        .attr("transform", `translate( ${0} , ${-20} )`) //NOTE: MODIFY POSITION OF ADD BUTTON HERE
        .attr("class", "function-btn");

    nodeButtonsContainer.append("rect")
        .attr("class", "function-bg add")
        .attr("width", "24px")
        .attr("height", "24px")
        .attr("transform", `translate( ${0} , ${-20} )`)
        .on("click", function (d) {
            addNode(d);
        });

    // Node Action Icons - Remove
    nodeButtonsContainer.filter(nodeCanBeDeleted).append("path")
        .attr("d", "M3.514 20.485c-4.686-4.686-4.686-12.284 0-16.97 4.688-4.686 12.284-4.686 16.972 0 4.686 4.686 4.686 12.284 0 16.97-4.688 4.687-12.284 4.687-16.972 0zM18.365 5.636c-3.516-3.515-9.214-3.515-12.728 0-3.516 3.515-3.516 9.213 0 12.728 3.514 3.515 9.213 3.515 12.728 0 3.514-3.515 3.514-9.213 0-12.728zM8.818 17.303l-2.121-2.122 3.182-3.182-3.182-3.182 2.121-2.122 3.182 3.182 3.182-3.182 2.121 2.122-3.182 3.182 3.182 3.182-2.121 2.122-3.182-3.182-3.182 3.182z")
        .attr("transform", `translate( ${20} , ${5} )`) //NOTE: MODIFY POSITION OF REMOVE BUTTONS HERe
        .attr("class", "function-btn");

    nodeButtonsContainer.filter(nodeCanBeDeleted).append("rect")
        .attr("class", "function-bg remove")
        .attr("width", "24px")
        .attr("height", "24px")
        .attr("transform", `translate( ${20} , ${5} )`)
        .on("click", deleteNode);

    // Node Action Icons - more(ellipsis)
    nodeButtonsContainer.append("path")
        .attr("d", "M13.829 3.004c-5.98 0-10.825 4.846-10.825 10.825S7.85 24.654 13.829 24.654c5.98 0 10.825-4.846 10.825-10.825S19.809 3.004 13.829 3.004M13.829 23.515c-5.342 0-9.686-4.344-9.686-9.684S8.487 4.145 13.829 4.145c5.341 0 9.686 4.344 9.686 9.686S19.17 23.515 13.829 23.515M13.829 11.836c-1.099 0-1.994.893-1.994 1.994S12.729 15.825 13.829 15.825s1.993-.894 1.993-1.995S14.928 11.836 13.829 11.836M13.829 14.685c-.47 0-.855-.384-.855-.855S13.358 12.975 13.829 12.975 14.684 13.36 14.684 13.829 14.299 14.685 13.829 14.685M19.526 11.836c-1.099 0-1.994.893-1.994 1.994s.894 1.995 1.994 1.995 1.994-.894 1.994-1.995S20.626 11.836 19.526 11.836M19.526 14.685c-.47 0-.855-.384-.855-.855s.384-.855.855-.855S20.381 13.36 20.381 13.829 19.997 14.685 19.526 14.685M8.131 11.836c-1.099 0-1.994.893-1.994 1.994s.893 1.995 1.994 1.995S10.126 14.929 10.126 13.829 9.231 11.836 8.131 11.836M8.131 14.685c-.47 0-.855-.384-.855-.855S7.662 12.975 8.131 12.975 8.986 13.36 8.986 13.829 8.602 14.685 8.131 14.685")
        .attr("transform", `translate( ${0} , ${30} )`)
        .attr("stroke", "#ff6600")
        .attr("stroke-width", "1.3")
        .attr("class", "function-btn ")

    nodeButtonsContainer.append("rect")
        .attr("class", "function-bg more")
        .attr("width", "24px")
        .attr("height", "24px")
        .attr("transform", `translate( ${0} , ${30} )`)
        .on("click", function (d) {
            setSelectedNode(d);
            editNodePopover.show(d);
              
        });

    var nodeupdate = node.transition()
        .duration(duration)
        .attr("transform", function (d) { return getMapOrientation().nodeUpdateTransform(d); }).style({ opacity: 1 });

    // Transition exiting nodes to the parent's new position.
    var nodeExit = node.exit().transition()
        .duration(duration)
        .attr("transform", function (d) { return "translate(" + source.y + "," + source.x + ")"; })
        .remove();

    nodeExit.select("circle")
        .attr("r", 1e-6);

    nodeExit.select("text")
        .style("fill-opacity", 1e-6);

    // update the links…
    var link = svg.selectAll("path.link")
        .data(links, function (d) { return d.target.nodeId; });

    //diagonal path link
    link.enter().insert("path", "g")
        .attr("class", "link")
        .attr("d", function (d) {
            var o = { x: source.x, y: source.y };
            return diagonal({ source: o, target: o });
        });

    // Transition links to their new position.
    link.transition()
        .duration(duration)
        .attr("d", diagonal);

    // Transition exiting nodes to the parent's new position.
    link.exit().transition()
        .duration(duration)
        .attr("d", function (d) {
            var o = { x: source.x, y: source.y };
            return diagonal({ source: o, target: o });
        })
        .remove();

    // Stash the old positions for transition.
    nodes.forEach(function (d) {
        d.x0 = d.x;
        d.y0 = d.y;
    });

} /*end updateMap*/

function setHeightMindmapContainer() {
    var newHeight = "" + $j(window).height() - $j(".navbar").outerHeight(true);
    $j(".mindmap-container").css("height", newHeight);
}

// ZOOM / PAN STUFF
function updateZoom() {
    d3.select("#gNodesContainer").attr("transform", "translate(" +
        d3.event.translate + ")" + "scale(" + d3.event.scale + ")");
    //window.currentScale = zoom.scale();
    //window.translate=  zoom.translate();
}

function nodeCanBeDeleted(d) {
    //top most level (depth 0) cannot be devared
    return d.depth > 0;
}


function setFill(d) {
    let fill  = '#fff';

    switch (d.depth) {
        case 0:
            fill  = '#4795D4';
            break;
        case 1:
            fill  = '#57544F';
            break;
        case 2:
            fill  = '#3F9A89';
            break;  
        default:
            fill  = '#EAAB4D';
            break;
    }

    return fill;
}


function nodeClicked(d, node) {
    if (d.children) {
        d._children = d.children;
        d.children = null;
    } else {
        d.children = d._children;
        d._children = null;
    }
    updateMap(d);
}


function addNode(d) {

    d3.event.stopPropagation();

    if (d._children) {
        d.children = d._children;
        d._children = null;
    }

    if (!d.children) {
        d.children = new Array();
    }

    var newChild = createNewChildNode(d);

    d.children.push(newChild);
    updateMap(d);

}

function deleteNode(d) {

    console.log(`deleted ${d.name()}`);

    var p = d.parent;
    var n_children = new Array();

    for (var i = 0; i < p.children.length; i++) {
        if (d.nodeId != p.children[i].nodeId) {
            n_children.push(p.children[i]);
        }
    }

    if (n_children.length > 0) {
        p.children = n_children;
    } else {
        p.children = null;
    }

    updateMap(p);
}

// create new node object
function createNewChildNode(d) {

    return new Node({
        name: "new node",
    });

}

function setMapOrientation() {

    let $buttonClicked = $j(this);

    if (currentMapOrientation == $buttonClicked.index()) {
        console.log("this button is already active");
        return;
    }

    // d3.selectAll('.node').remove();
    $switchOrientationBtn.removeClass("btn-success");
    $buttonClicked.addClass("btn-success");

    currentMapOrientation = $buttonClicked.index();

    //update ff elements to new position
    let nodeRect = d3.selectAll(".nodeRect");
    nodeRect.transition().duration(0).attr("transform", function (d) { return getMapOrientation().rectTransform(d); });

    let nodeLabel = d3.selectAll(".nodeText");

    nodeLabel.attr("x", getMapOrientation().textX)
        .attr("y", getMapOrientation().textY);

    setRootNodePosition(currentMapOrientation);

    updateMap(sourceData);
}

function getMapOrientation() {

    let settings = {};

    switch (currentMapOrientation) {
        case mapOrientation.LEFT_TO_RIGHT:
            settings = {
                "nodeSize": [nodeHeight + siblingsGap, nodeWidth + parentChildGap],
                "diagonalProjection": function (d) { return [d.y, d.x]; },
                "diagonalTargetOffset": nodeWidth,
                "gTransform": function (d) { return "translate(" + d.y + "," + d.x + ")"; },  /* node.enter().append("g").attr(transform) */
                "rectTransform": function (d) { return "translate(" + (-nodeWidth) + "," + (-nodeHeight / 2) + ")"; },
                "textX": -nodeWidth / 2,
                "textY": 0,
                "nodeUpdateTransform": function (d) { return "translate(" + d.y + "," + d.x + ")"; }
            };
            break;
        case mapOrientation.TOP_TO_BOTTOM:
            settings = {
                "nodeSize": [nodeWidth + siblingsGap, nodeHeight + parentChildGap],
                "diagonalProjection": function (d) { return [d.x, d.y]; },
                "diagonalTargetOffset": nodeHeight,
                "gTransform": function (d) { return "translate(" + d.x + "," + d.y + ")"; },  /* node.enter().append("g").attr(transform) */
                "rectTransform": function (d) { return "translate(" + (-nodeWidth / 2) + "," + (-nodeHeight) + ")"; },
                "textX": 0,
                "textY": -nodeHeight / 2,
                "nodeUpdateTransform": function (d) { return "translate(" + d.x + "," + d.y + ")"; }
            };
            break;
    }
    return settings;
}

//set root node position
//@params {int} orientation - either 0 ir  1. defaults to left to right
function setRootNodePosition(orientation = 1) {

    if (orientation == mapOrientation.LEFT_TO_RIGHT) {
        zoom.translate([nodeWidth + 20, $j('.mindmap-container').height() / 2 - nodeHeight / 2]);
        d3.select("#gNodesContainer").attr("transform", "translate(" + (nodeWidth + 20) + ", " + ($j('.mindmap-container').height() / 2 - nodeHeight / 2) + " )");
    }
    else { /*  mapOrientation.TOP_TO_BOTTOM */
        zoom.translate([$j('.mindmap-container').width() / 2, nodeHeight]);
        d3.select("#gNodesContainer").attr("transform", "translate(" + $j('.mindmap-container').width() / 2 + ", " + nodeHeight + " )");
    }

}


/****************
 * EVENT HANDLERS 
 ****************/

$j(document).on("deleteNodeAttempt", function (evt, d) {
    console.log(`custom event: ${evt.type}`);

    Swal.fire({
        // title: `Are you sure you want to delete "${d.name()}"`,
        text: "This will delete the item you’ve clicked and everything underneath this.  If this is your intent, proceed, if not you can navigate to the item to remove specific things, or click the dot to simply collapse the branch without deleting.",
        type: null,
        showCancelButton: true,
        // confirmButtonColor: '#3085d6',
        // cancelButtonColor: '#d33',
        confirmButtonText: 'I understand, delete forever',
        cancelButtonText: 'cancel'
    }).then((result) => {
        if (result.value) {
            //call actual deletion
            deleteNode(d);
        }
    });
});

var $switchOrientationBtn = $j('.switch-orientation')
$switchOrientationBtn.on('click', setMapOrientation);

$j(window).resize(function() {
    setHeightMindmapContainer();
});

/****************************************
POPOVERS/OVERLAYS
*****************************************/

var editNodePopover = {
    DOM: {},
    //save data value on popup for reverting updates

    init: function () {        
        // cache dom
        this.DOM.$container = $j(".node-update-popover");
        this.DOM.$form = $j("#node_update_popover_form");
        this.DOM.$nameInput = $j('#name_input', this.DOM.$container);
        this.DOM.$cancelBtn = $j('.cancel-edit', this.DOM.$container),


        //initialize popupoverlay
        this.DOM.$container.popup({
            // color: "rgba(51, 0, 102, 0.75)",
            color: 'white',
            opacity: 1,
            transition: '0.3s',
            scrolllock: true,
            blur: false,
            // autoopen: true,
            openelement: '.node-update-popover-open',
            closeelement: '.node-update-popover-close',
            // escape: false,

            onopen: function () {

                // set input texts to acutal value
                setTimeout(function () {
                    // set in here to set focus and move cursor to end of input
                    editNodePopover.DOM.$nameInput.val(selectedNode.name()).focus();                   
                }, 100 );
            },

        });

        this.registerHandlers();
    },

    show: function (data) {
        // init popoverlay plugin
        this.DOM.$container.popup('show');
    },

    save: function(){
        var newName = editNodePopover.DOM.$nameInput.val();
        selectedNode.name( newName );
    },

    registerHandlers: function () {

        this.DOM.$form.on('submit', function (evt) {          

            this.save();            
            updateMap(selectedNode);
            // this.DOM.$form.trigger('reset');
            this.DOM.$container.popup('hide');
            evt.preventDefault();
            return;
        }.bind(this));
    },
};

var menuItemsPopover = {

    DOM: {},

    init: function(){  
        // CACHE DOM elements
        this.DOM.$container = $j("#menuItems");
        this.DOM.itemsList = $j(".items-list"); 
        
        this.registerHandlers();          
    },    

    show: function (node) {  
         
        this.DOM.$container.popup({
            horizontal: 'left',
            vertical: 'top',
            tooltipanchor: event.target,
            container: "body",
            autoopen: true,
            type: 'tooltip',           
            offsettop: 8,
            offsetleft:28
        }); 
        // init popoverlay plugin
        
        //fixes bug for tooltip wrong position on first load only
        this.DOM.$container.popup('reposition');          
    },

    hide: function(){
        this.DOM.$container.popup('hide');
    },

    registerHandlers: function(){

        this.DOM.itemsList.off('click').on("click", "li", function (e) {

            if (e.target !== e.currentTarget) {

                if ($j(e.target).hasClass("edit")) {
                    // opens popover
                    // alert('edit clicked')
              
                    console.dir(selectedNode )     

                }
                else if ($j(e.target).hasClass("delete")) {
                    $j(document).trigger("deleteNodeAttempt", [selectedNode]);   
                    console.dir( selectedNode)
                   
                }       

            }

            menuItemsPopover.hide();      

        });
    },
};


