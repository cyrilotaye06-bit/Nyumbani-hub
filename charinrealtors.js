// ==========================================
// Nyumbani Hub APP.JS
// ==========================================

let properties =
JSON.parse(localStorage.getItem("charinProperties")) || [];

const propertyForm =
document.getElementById("propertyForm");

const propertyList =
document.getElementById("propertyList");

// ==========================================
// SAVE TO LOCAL STORAGE
// ==========================================

function saveProperties() {
    localStorage.setItem(
        "charinProperties",
        JSON.stringify(properties)
    );
}

// ==========================================
// LOAD PROPERTIES
// ==========================================

function loadProperties() {

    if (!propertyList) return;

    propertyList.innerHTML = "";

    properties.forEach(property => {

        propertyList.innerHTML += `

        <div class="property-card">

            <img src="${property.image}" alt="${property.title}">

            <div class="content">

                <span class="badge">
                    ${property.category}
                </span>

                <h3>${property.title}</h3>

                <p><strong>Location:</strong>
                ${property.location}</p>

                <p><strong>Price:</strong>
                KES ${Number(property.price).toLocaleString()}</p>

                <p><strong>Bedrooms:</strong>
                ${property.bedrooms}</p>

                <p><strong>Bathrooms:</strong>
                ${property.bathrooms}</p>

                <p><strong>Size:</strong>
                ${property.size} Sq Ft</p>

                <p><strong>Available:</strong>
                ${property.available}</p>

                <p><strong>Phone:</strong>
                ${property.phone}</p>

                <p>${property.description}</p>

                <button onclick="editProperty(${property.id})">
                    Edit
                </button>

                <button
                    class="delete-btn"
                    onclick="deleteProperty(${property.id})">
                    Delete
                </button>

            </div>

        </div>

        `;
    });
}

// ==========================================
// ADD PROPERTY
// ==========================================

if(propertyForm){

propertyForm.addEventListener("submit", function(e){

    e.preventDefault();

    const imageFile =
    document.getElementById("image").files[0];

    const reader = new FileReader();

    reader.onload = function(){

        const property = {

            id: Date.now(),

            title:
            document.getElementById("title").value,

            category:
            document.getElementById("category").value,

            price:
            document.getElementById("price").value,

            location:
            document.getElementById("location").value,

            bedrooms:
            document.getElementById("bedrooms").value,

            bathrooms:
            document.getElementById("bathrooms").value,

            size:
            document.getElementById("size").value,

            available:
            document.getElementById("available").value,

            phone:
            document.getElementById("phone").value,

            description:
            document.getElementById("description").value,

            image:
            reader.result

        };

        properties.push(property);

        saveProperties();

        loadProperties();

        propertyForm.reset();

        alert("Property Added Successfully");

    };

    if(imageFile){
        reader.readAsDataURL(imageFile);
    }

});

}

// ==========================================
// DELETE PROPERTY
// ==========================================

function deleteProperty(id){

    const confirmDelete =
    confirm("Delete this property?");

    if(!confirmDelete) return;

    properties =
    properties.filter(
        property => property.id !== id
    );

    saveProperties();

    loadProperties();

}

// ==========================================
// EDIT PROPERTY
// ==========================================

function editProperty(id){

    const property =
    properties.find(
        property => property.id === id
    );

    if(!property) return;

    document.getElementById("title").value =
    property.title;

    document.getElementById("category").value =
    property.category;

    document.getElementById("price").value =
    property.price;

    document.getElementById("location").value =
    property.location;

    document.getElementById("bedrooms").value =
    property.bedrooms;

    document.getElementById("bathrooms").value =
    property.bathrooms;

    document.getElementById("size").value =
    property.size;

    document.getElementById("available").value =
    property.available;

    document.getElementById("agent").value =
    property.agent;

    document.getElementById("phone").value =
    property.phone;

    document.getElementById("description").value =
    property.description;

    deleteProperty(id);

    window.scrollTo({
        top:0,
        behavior:"smooth"
    });

}

// ==========================================
// SEARCH FUNCTION
// ==========================================

function searchProperties(){

    const searchInput =
    document.getElementById("searchInput")
    .value.toLowerCase();

    const cards =
    document.querySelectorAll(".property-card");

    cards.forEach(card=>{

        const text =
        card.innerText.toLowerCase();

        if(text.includes(searchInput)){
            card.style.display="block";
        }
        else{
            card.style.display="none";
        }

    });

}

// ==========================================
// FILTER CATEGORY
// ==========================================

function filterCategory(category){

    const cards =
    document.querySelectorAll(".property-card");

    cards.forEach(card=>{

        const badge =
        card.querySelector(".badge")
        .innerText;

        if(category === "All"){
            card.style.display="block";
        }

        else if(badge === category){
            card.style.display="block";
        }

        else{
            card.style.display="none";
        }

    });

}

// ==========================================
// PROPERTY COUNTERS
// ==========================================

function updateStatistics(){

    const rentals =
    properties.filter(
    p=>p.category==="Rental").length;

    const sales =
    properties.filter(
    p=>p.category==="Sale").length;

    const bnbs =
    properties.filter(
    p=>p.category==="BnB").length;

    const resales =
    properties.filter(
    p=>p.category==="Resale").length;

    const rentalsCount =
    document.getElementById("rentalsCount");

    const salesCount =
    document.getElementById("salesCount");

    const bnbsCount =
    document.getElementById("bnbsCount");

    const resaleCount =
    document.getElementById("resaleCount");

    if(rentalsCount)
        rentalsCount.innerText = rentals;

    if(salesCount)
        salesCount.innerText = sales;

    if(bnbsCount)
        bnbsCount.innerText = bnbs;

    if(resaleCount)
        resaleCount.innerText = resales;

}

// ==========================================
// LOAD PAGE
// ==========================================

document.addEventListener(
"DOMContentLoaded",
function(){

    loadProperties();

    updateStatistics();

});